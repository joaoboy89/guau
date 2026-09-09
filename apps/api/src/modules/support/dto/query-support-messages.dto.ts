import { IsOptional, IsInt, Min, Max } from "class-validator";
import { Type } from "class-transformer";
import { ApiPropertyOptional } from "@nestjs/swagger";

// Paginación real desde el arranque — no el backstop de take:200 de
// ChatService.getMessages() (ver el comentario de ese método: es un
// número provisorio, no un techo pensado). 50 alcanza a una conversación
// entera en la práctica (20-50 mensajes en 4-5 horas, mismo criterio que
// ese comentario) y 100 es el techo real para cuando no alcance.
export class QuerySupportMessagesDto {
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
}
