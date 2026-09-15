import { Controller, Get, Res } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { ApiTags, ApiOperation } from "@nestjs/swagger";
import { Response } from "express";
import { HealthService } from "./health.service";

// UptimeRobot pega ~12 veces por hora — 30/min es holgado para eso y
// bastante mas estricto que el throttler global (100/min), que es
// demasiado permisivo para una ruta publica que toca la base.
const HEALTH_THROTTLE = { default: { limit: 30, ttl: 60_000 } };

// Publica a proposito, sin JwtAuthGuard: UptimeRobot no tiene credenciales
// para pegarle (ver la lista de rutas publicas en docs/guau-pendientes.md).
//
// Contrato de la respuesta: EXACTAMENTE { "status": "ok" } o
// { "status": "degraded" }. Nada de version, entorno, uptime, version de
// Node/Postgres, nombre de la base, ni el mensaje de la excepcion — un
// /health hablador le regala a un atacante el inventario para buscar
// vulnerabilidades conocidas, y un mensaje de error de Postgres puede
// publicar la IP interna de la base. Por eso responde con @Res() directo
// en vez de tirar una excepcion: así el body nunca pasa por el
// HttpExceptionFilter global, que le agregaria statusCode/timestamp/path.
//
// REGLA PARA EL FUTURO: si este endpoint alguna vez necesita decir MAS
// (que subsistema esta caido, desde cuando), esa version va DETRAS DE UN
// TOKEN, no publica — UptimeRobot soporta headers custom. Publico y mudo,
// o privado y hablador. Nunca publico y hablador.
@ApiTags("Health")
@Controller("health")
export class HealthController {
  constructor(private health: HealthService) {}

  @Get()
  @Throttle(HEALTH_THROTTLE)
  @ApiOperation({ summary: "Chequeo de salud publico para monitoreo externo (UptimeRobot)" })
  async check(@Res() res: Response) {
    const ok = await this.health.checkDatabase();
    res.status(ok ? 200 : 503).json({ status: ok ? "ok" : "degraded" });
  }
}
