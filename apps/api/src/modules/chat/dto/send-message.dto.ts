import { IsString, MinLength, MaxLength } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class SendMessageDto {
  @ApiProperty({ example: "¡Hola! Confirmo para las 9am en la puerta del edificio." })
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  content: string;
}
