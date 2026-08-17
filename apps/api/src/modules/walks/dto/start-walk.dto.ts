import { IsIn, IsNotEmpty, IsOptional, IsString, Length, Matches, MaxLength, ValidateIf } from "class-validator";
import { Transform } from "class-transformer";
import { ApiPropertyOptional } from "@nestjs/swagger";
import {
  PICKUP_CODE,
  START_WITHOUT_CODE_REASON,
  START_WITHOUT_CODE_OTHER_MAX_LENGTH,
  type StartWithoutCodeReason,
} from "@guau/shared";

const REASON_VALUES = Object.values(START_WITHOUT_CODE_REASON);

// Superficie nueva de entrada (Ventanas de CLAUDE.md, la 3 sobre todo):
// start() pasa a aceptar un body. Dos caminos, mutuamente excluyentes en la
// intención pero validados cada uno por su cuenta acá — cuál de los dos
// hace falta (y que no falten los dos) lo decide el service, con un mensaje
// más útil que el genérico de un validador cruzado.
export class StartWalkDto {
  // Length(4,4) fija el tamaño exacto — no @MaxLength, que dejaría pasar
  // "1" o "12". Matches valida que sean dígitos: sin esto, class-validator
  // aceptaría "abcd" (4 caracteres) como código válido.
  @ApiPropertyOptional({ example: "4821", description: "Código de 4 dígitos que le pasó el dueño" })
  @IsOptional()
  @IsString()
  @Length(PICKUP_CODE.LENGTH, PICKUP_CODE.LENGTH, { message: "El código tiene que tener exactamente 4 dígitos" })
  @Matches(/^\d+$/, { message: "El código tiene que ser numérico" })
  pickupCode?: string;

  @ApiPropertyOptional({ enum: REASON_VALUES, description: "Motivo de iniciar sin código" })
  @IsOptional()
  @IsIn(REASON_VALUES)
  reason?: StartWithoutCodeReason;

  // Solo se valida (y solo hace falta) cuando reason === OTHER. El trim en
  // Transform evita que " " cuente como motivo real y corra antes que
  // MaxLength, así el tope mide el texto que de verdad va a la base.
  @ApiPropertyOptional({ example: "Me lo dejó en la conserjería" })
  @ValidateIf((dto: StartWalkDto) => dto.reason === START_WITHOUT_CODE_REASON.OTHER)
  @IsString()
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsNotEmpty({ message: "Contanos el motivo de por qué iniciás sin código" })
  @MaxLength(START_WITHOUT_CODE_OTHER_MAX_LENGTH)
  otherReason?: string;
}
