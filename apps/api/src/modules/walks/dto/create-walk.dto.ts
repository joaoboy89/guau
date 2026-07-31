import {
  IsString,
  IsArray,
  IsDateString,
  IsNumber,
  IsOptional,
  IsIn,
  ArrayMinSize,
  ArrayMaxSize,
  Min,
  Max,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class CreateWalkDto {
  @ApiProperty({ description: "ID del WalkerProfile seleccionado" })
  @IsString()
  walkerId: string;

  @ApiProperty({ description: "ID del WalkType (duración + precio)" })
  @IsString()
  walkTypeId: string;

  @ApiProperty({ description: "IDs de los perros que van al paseo", type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  // Multi-perro: el precio no lo contempla (amountPaid sale de basePrice sin
  // mirar la cantidad — WalksService.create() reparte basePrice / N en vez de
  // cobrar basePrice * N). Subir este número recién cuando exista la
  // política de precio por N perros — ver docs/guau-pendientes.md.
  @ArrayMaxSize(1)
  @IsString({ each: true })
  dogIds: string[];

  @ApiProperty({ example: "2026-07-01T09:00:00Z" })
  @IsDateString()
  scheduledAt: string;

  @ApiProperty({ example: -34.5885 })
  @IsNumber()
  @Min(-90)
  @Max(90)
  pickupLat: number;

  @ApiProperty({ example: -58.4233 })
  @IsNumber()
  @Min(-180)
  @Max(180)
  pickupLng: number;

  @ApiProperty({ example: "Av. Santa Fe 1234, Palermo, CABA" })
  @IsString()
  pickupAddress: string;

  @ApiPropertyOptional({ enum: ["GRUPAL", "EXCLUSIVO"], default: "GRUPAL" })
  @IsOptional()
  @IsIn(["GRUPAL", "EXCLUSIVO"])
  mode?: "GRUPAL" | "EXCLUSIVO";
}
