import { IsOptional, IsString, MaxLength } from "class-validator";
import { ApiPropertyOptional } from "@nestjs/swagger";

export class CancelWalkDto {
  @ApiPropertyOptional({ example: "No puedo en ese horario" })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  cancellationReason?: string;
}
