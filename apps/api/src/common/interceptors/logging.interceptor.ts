import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
  HttpException,
} from "@nestjs/common";
import { Observable } from "rxjs";
import { tap } from "rxjs/operators";

// Rutas de monitoreo externo cuyo trafico rutinario no aporta nada al log y
// solo tapa lo que si importa: UptimeRobot le pega a /health cada 5
// minutos (~8600 lineas identicas por mes, GET /health 200 — 2ms), en el
// mismo log de Docker donde viven los logger.error del webhook de
// MercadoPago, la reconciliacion de pagos y el chat. Lista explicita, no
// un "if url === X" suelto: el dia que haya otra ruta de monitoreo se
// agrega aca y se entiende por que existe.
const SILENCED_ROUTES = ["/health"];

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger("HTTP");

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest();
    const { method, url } = req;
    const path: string = url.split("?")[0];

    if (SILENCED_ROUTES.includes(path)) {
      return next.handle();
    }

    const now = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const res = context.switchToHttp().getResponse();
          this.logger.log(`${method} ${url} ${res.statusCode} — ${Date.now() - now}ms`);
        },
        // tap(fn) solo corre en el camino de exito — con una excepcion RxJS
        // se va por el canal de error y ese camino nunca se ejecutaba, asi
        // que el log de HTTP mostraba unicamente lo que anduvo. En
        // produccion (VPS) esto importa mas que en staging: en Cloud Run
        // Google loguea el "POST 400" por su cuenta y tapaba el agujero
        // por accidente; en el VPS no hay nadie mas logueando — si la app
        // no lo escribe, no existe.
        error: (err: unknown) => {
          // La respuesta todavia no se escribio cuando la excepcion viaja
          // por acá, asi que res.statusCode puede no ser el final — el
          // status sale de la excepcion, nunca de la response. Si es
          // HttpException (4xx del ValidationPipe, NotFound, Conflict,
          // etc.) usa su propio status; si no, es un error no manejado y
          // Nest siempre lo resuelve como 500 (BaseExceptionFilter.
          // handleUnknownError) — no hay ambiguedad que adivinar.
          const status = err instanceof HttpException ? err.getStatus() : 500;
          this.logger.log(`${method} ${url} ${status} — ${Date.now() - now}ms`);
        },
      })
    );
  }
}
