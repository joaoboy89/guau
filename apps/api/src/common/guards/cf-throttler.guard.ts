import { Injectable } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";

// Detrás de Cloudflare Tunnel todas las requests llegan al proceso con la IP
// del contenedor cloudflared en req.ip — el rate limit por defecto termina
// siendo un balde único compartido por todos los usuarios. Cloudflare agrega
// el header cf-connecting-ip con la IP real del cliente; lo usamos como
// tracker, con fallback a req.ip si no está presente (dev/tests locales).
@Injectable()
export class CfThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    const header = req.headers?.["cf-connecting-ip"];
    const cfIp = Array.isArray(header) ? header[0] : header;
    return cfIp || req.ip;
  }
}
