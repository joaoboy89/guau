import { ExecutionContext, Injectable, Logger } from "@nestjs/common";
import { ThrottlerGuard, ThrottlerLimitDetail } from "@nestjs/throttler";

// Detrás de Cloudflare Tunnel todas las requests llegan al proceso con la IP
// del contenedor cloudflared en req.ip — el rate limit por defecto termina
// siendo un balde único compartido por todos los usuarios. Cloudflare agrega
// el header cf-connecting-ip con la IP real del cliente; lo usamos como
// tracker, con fallback a req.ip si no está presente (dev/tests locales).
@Injectable()
export class CfThrottlerGuard extends ThrottlerGuard {
  private readonly logger = new Logger(CfThrottlerGuard.name);

  // La firma con Record<string, any> viene de ThrottlerGuard (@nestjs/throttler):
  // así de agnóstica del adaptador HTTP para servir a Express y Fastify a la
  // vez, y no se puede angostar sin romper el override. El any se contiene
  // acá — adentro del método, todo el código usa la forma tipada de abajo,
  // no el parámetro. Sin esto, un typo como req.headrs compilaría igual,
  // devolvería undefined, y el guard caería en silencio al fallback de
  // req.ip — justo la degradación silenciosa del rate limiting que existe
  // para evitar.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected async getTracker(req: Record<string, any>): Promise<string> {
    const typedReq = req as {
      headers?: Record<string, string | string[] | undefined>;
      ip?: string;
    };
    const header = typedReq.headers?.["cf-connecting-ip"];
    const cfIp = Array.isArray(header) ? header[0] : header;
    // Si no hay ni cf-connecting-ip ni ip, todas esas requests comparten un
    // único balde a propósito: es la dirección segura — limita de más, no de
    // menos. No debería pasar nunca en producción (Cloudflare y Express
    // siempre ponen alguno de los dos).
    return cfIp || typedReq.ip || "";
  }

  // ThrottlerGuard rechaza en el guard, antes de que LoggingInterceptor vea
  // la request: un 429 nunca queda en el log de la app, solo en el de
  // infra de Cloud Run. Resultado real: un usuario que reporta "no puedo
  // entrar" es indistinguible de un bloqueo hasta que alguien va a buscarlo
  // a mano en GCP. Este override cierra ese hueco logueando el bloqueo en
  // el mismo lugar donde ThrottlerGuard decide rechazar.
  //
  // Qué identificador loguear: no la IP cruda — es dato personal
  // acumulándose sin límite en un log que nadie purga. Usamos en cambio
  // throttlerLimitDetail.key, el hash (sha256 de clase+handler+throttler+IP)
  // que ThrottlerGuard ya calcula por su cuenta como clave de storage para
  // contar los hits — no hay que derivar nada nuevo. Es determinístico por
  // (ruta, IP): la misma fuente bloqueada en la misma ruta siempre deja el
  // mismo hash, así que alcanza para correlacionar "esta fuente ya venía
  // siendo bloqueada acá" sin que la IP real quede persistida en ningún
  // lado.
  protected async throwThrottlingException(
    context: ExecutionContext,
    throttlerLimitDetail: ThrottlerLimitDetail,
  ): Promise<void> {
    const req = context.switchToHttp().getRequest<{ method?: string; url?: string }>();
    this.logger.warn(
      `${req.method ?? "?"} ${req.url ?? "?"} bloqueado (429) — tracker=${throttlerLimitDetail.key}`,
    );
    return super.throwThrottlingException(context, throttlerLimitDetail);
  }
}
