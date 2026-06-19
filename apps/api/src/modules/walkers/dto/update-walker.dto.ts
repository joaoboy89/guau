import { IsString, IsOptional, IsInt, Min, Max } from "class-validator";
import { ApiPropertyOptional } from "@nestjs/swagger";

export class UpdateWalkerDto {
  @ApiPropertyOptional({ example: "Paseadora con 3 años de experiencia en Palermo." })
  @IsOptional()
  @IsString()
  bio?: string;

  @ApiPropertyOptional({ example: 6 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  maxDogsPerWalk?: number;
}
