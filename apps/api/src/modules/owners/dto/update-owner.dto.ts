import { IsString, IsOptional, IsNumber, Min, Max } from "class-validator";
import { ApiPropertyOptional } from "@nestjs/swagger";

export class UpdateOwnerDto {
  @ApiPropertyOptional({ example: "Av. Corrientes 1234, CABA" })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({ example: "Palermo" })
  @IsOptional()
  @IsString()
  neighborhood?: string;

  @ApiPropertyOptional({ example: -34.5885 })
  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat?: number;

  @ApiPropertyOptional({ example: -58.4233 })
  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng?: number;
}
