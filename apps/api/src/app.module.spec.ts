import { Controller, Get, BadRequestException, INestApplication } from "@nestjs/common";
import { APP_FILTER } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import * as http from "http";
import { SentryGlobalFilter } from "@sentry/nestjs/setup";
import * as Sentry from "@sentry/nestjs";
// SentryGlobalFilter llama a captureException importado directo de
// @sentry/core, no al re-export de @sentry/nestjs — espiar el namespace
// equivocado da un falso negativo (probado: el spy queda en 0 llamadas
// aunque el filtro sí reporte). Hay que espiar el módulo real.
import * as SentryCore from "@sentry/core";
import { HttpExceptionFilter } from "./common/filters/http-exception.filter";

/**
 * Este archivo existe por un motivo puntual: el orden de los dos APP_FILTER
 * globales en app.module.ts es CONTRAINTUITIVO y no hay forma de verificarlo
 * leyendo el codigo — hay que probarlo con un request HTTP real.
 *
 * NestJS invierte el array de filtros antes de resolverlos
 * (RouterExceptionFilters.create() hace `filters.reverse()`), asi que el
 * ULTIMO provider declarado en app.module.ts es el PRIMERO que se evalua en
 * runtime. Con SentryGlobalFilter declarado antes que HttpExceptionFilter,
 * HttpExceptionFilter (scopeado a @Catch(HttpException)) termina ganando
 * para toda excepcion HTTP esperada, y SentryGlobalFilter (@Catch(), agarra
 * todo) solo se ejecuta para lo que nada mas atrapa. Si algun dia alguien
 * "ordena" ese array de forma mas prolija, este test lo va a detectar.
 */
@Controller("__test")
class ProbeController {
  @Get("expected")
  throwExpected(): never {
    throw new BadRequestException("motivo de prueba");
  }

  @Get("unhandled")
  throwUnhandled(): never {
    throw new Error("bug no manejado de prueba");
  }
}

function get(port: number, path: string): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    http
      .get(`http://127.0.0.1:${port}${path}`, (res) => {
        let raw = "";
        res.on("data", (chunk) => (raw += chunk));
        res.on("end", () => resolve({ status: res.statusCode as number, body: JSON.parse(raw) }));
      })
      .on("error", reject);
  });
}

describe("Orden de filtros globales (app.module.ts)", () => {
  let app: INestApplication;
  let port: number;
  let captureExceptionSpy: jest.SpyInstance;

  beforeAll(async () => {
    // DSN de mentira: alcanza para que Sentry.init() arme un client real (no
    // no-op) y captureException tenga algo que hacer al llamarse.
    Sentry.init({ dsn: "https://abc123@o0.ingest.sentry.io/12345", tracesSampleRate: 0 });

    const moduleRef = await Test.createTestingModule({
      controllers: [ProbeController],
      providers: [
        // Mismo orden que app.module.ts — a propósito, para probar el orden real.
        { provide: APP_FILTER, useClass: SentryGlobalFilter },
        { provide: APP_FILTER, useClass: HttpExceptionFilter },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useLogger(false);
    await app.listen(0);
    port = (app.getHttpServer().address() as { port: number }).port;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    captureExceptionSpy = jest.spyOn(SentryCore, "captureException").mockImplementation();
  });

  afterEach(() => {
    captureExceptionSpy.mockRestore();
  });

  it("una excepcion HTTP esperada (4xx) la maneja HttpExceptionFilter — shape completo, sin Sentry", async () => {
    const res = await get(port, "/__test/expected");

    expect(res.status).toBe(400);
    // statusCode + timestamp + path + message + error: el shape completo de
    // HttpExceptionFilter, no el de Nest por default (que no tiene
    // timestamp/path) — prueba que ES este filtro el que respondió.
    expect(res.body).toMatchObject({
      statusCode: 400,
      path: "/__test/expected",
      message: "motivo de prueba",
    });
    expect(res.body).toHaveProperty("timestamp");
    expect(captureExceptionSpy).not.toHaveBeenCalled();
  });

  it("una excepcion NO manejada (bug real) la reporta Sentry y cae al fallback de siempre", async () => {
    const res = await get(port, "/__test/unhandled");

    expect(res.status).toBe(500);
    // El fallback de Nest de toda la vida — nada cambia ahí, solo se suma
    // el reporte a Sentry.
    expect(res.body).toEqual({ statusCode: 500, message: "Internal server error" });
    expect(captureExceptionSpy).toHaveBeenCalledTimes(1);
    expect((captureExceptionSpy.mock.calls[0][0] as Error).message).toBe("bug no manejado de prueba");
  });
});
