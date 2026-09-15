import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
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
      tap(() => {
        const res = context.switchToHttp().getResponse();
        this.logger.log(`${method} ${url} ${res.statusCode} — ${Date.now() - now}ms`);
      })
    );
  }
}
