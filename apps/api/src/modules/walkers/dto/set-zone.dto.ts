import { IsNumber, Min, Max } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class SetZoneDto {
  @ApiProperty({ example: -34.5885, description: "Latitud del centro de la zona" })
  @IsNumber()
  @Min(-90)
  @Max(90)
  centerLat: number;

  @ApiProperty({ example: -58.4233, description: "Longitud del centro de la zona" })
  @IsNumber()
  @Min(-180)
  @Max(180)
  centerLng: number;

  @ApiProperty({ example: 3, description: "Radio de operación en kilómetros" })
  @IsNumber()
  @Min(0.5)
  @Max(20)
  radiusKm: number;
}
