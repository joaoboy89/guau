import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../database/prisma.service";

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(private prisma: PrismaService) {}

  // La consulta mas barata que existe: no toca ninguna tabla, solo confirma
  // que la conexion a Postgres responde. Un /health que no pega en la base
  // prueba MENOS que /walk-types — solo diria "Node esta vivo".
  async checkDatabase(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch (err) {
      // El detalle SI se loguea del lado del servidor (para que Sentry lo
      // levante) pero NUNCA sale en la respuesta — ver health.controller.ts.
      this.logger.error(`Health check: la base no respondio — ${err}`);
      return false;
    }
  }
}
