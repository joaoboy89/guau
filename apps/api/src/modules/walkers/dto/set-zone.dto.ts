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

  @ApiProperty({ example: 3, description: "Radio de operación en kilómetros (1 a 3, caminando)" })
  @IsNumber()
  // 20 km era un valor de prueba, no una decisión de producto: nadie camina
  // perros a 20 km de su zona. 1-3 km es lo que razonablemente cubre a
  // alguien que se mueve a pie. Este rango rige lo que se guarda de acá en
  // adelante — los perfiles ya guardados con un radio fuera de rango no se
  // tocan hasta que el paseador actualice su zona.
  @Min(1)
  @Max(3)
  radiusKm: number;
}
