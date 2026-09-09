import { IsOptional, IsString, IsEmail, IsDateString, IsInt, Min, Max, MinLength, MaxLength } from "class-validator";
import { Type } from "class-transformer";
import { ApiPropertyOptional } from "@nestjs/swagger";

export class QuerySupportWalksDto {
  // 8 caracteres es el mínimo, no un default — sin techo, ?idPrefix=a
  // devolvería media base filtrada por un solo carácter.
  @ApiPropertyOptional({ description: "Prefijo del UUID del paseo, mínimo 8 caracteres" })
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(36)
  idPrefix?: string;

  @ApiPropertyOptional({ description: "Mail del dueño o del paseador — busca en los dos lados" })
  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string;

  @ApiPropertyOptional({ description: "Desde (scheduledAt), ISO 8601" })
  @IsOptional()
  @IsDateString()
  desde?: string;

  @ApiPropertyOptional({ description: "Hasta (scheduledAt), ISO 8601" })
  @IsOptional()
  @IsDateString()
  hasta?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 20;
}
