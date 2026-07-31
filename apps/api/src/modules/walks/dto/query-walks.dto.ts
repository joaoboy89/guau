import { IsOptional, IsIn, IsInt, Min, Max } from "class-validator";
import { Type } from "class-transformer";
import { ApiPropertyOptional } from "@nestjs/swagger";

export class QueryWalksDto {
  @ApiPropertyOptional({
    enum: [
      "PENDING", "CONFIRMED", "WALKER_ON_WAY",
      "IN_PROGRESS", "COMPLETED", "CANCELLED_OWNER", "CANCELLED_WALKER",
    ],
  })
  @IsOptional()
  @IsIn([
    "PENDING", "CONFIRMED", "WALKER_ON_WAY",
    "IN_PROGRESS", "COMPLETED", "CANCELLED_OWNER", "CANCELLED_WALKER",
  ])
  status?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 50, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 50;

  // Ventana de historial en días. Default 30 (decisión de producto). El tope
  // de 365 no es un capricho: sin techo, ?days=99999 es "traeme todo" con
  // otro nombre — el mismo problema que esta tarea vino a cerrar.
  @ApiPropertyOptional({ default: 30, maximum: 365 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  days?: number = 30;
}
