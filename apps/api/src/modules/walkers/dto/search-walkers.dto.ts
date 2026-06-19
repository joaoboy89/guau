import { IsNumber, IsOptional, IsString, IsDateString, Min, Max } from "class-validator";
import { Type } from "class-transformer";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class SearchWalkersDto {
  @ApiProperty({ example: -34.5885, description: "Latitud de la ubicación del dueño" })
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat: number;

  @ApiProperty({ example: -58.4233, description: "Longitud de la ubicación del dueño" })
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng: number;

  @ApiPropertyOptional({ example: "2026-07-01T09:00:00Z", description: "Filtrar por disponibilidad en esta fecha/hora" })
  @IsOptional()
  @IsDateString()
  date?: string;

  @ApiPropertyOptional({ description: "Filtrar por tipo de paseo (ID)" })
  @IsOptional()
  @IsString()
  walkTypeId?: string;
}
