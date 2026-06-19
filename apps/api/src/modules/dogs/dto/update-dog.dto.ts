import {
  IsString,
  IsOptional,
  IsInt,
  IsNumber,
  IsIn,
  Min,
  Max,
  MinLength,
} from "class-validator";
import { ApiPropertyOptional } from "@nestjs/swagger";

export class UpdateDogDto {
  @ApiPropertyOptional({ example: "Mochi" })
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @ApiPropertyOptional({ example: "Golden Retriever" })
  @IsOptional()
  @IsString()
  breed?: string;

  @ApiPropertyOptional({ example: "large", enum: ["small", "medium", "large"] })
  @IsOptional()
  @IsIn(["small", "medium", "large"])
  size?: string;

  @ApiPropertyOptional({ example: 4 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(30)
  ageYears?: number;

  @ApiPropertyOptional({ example: 14.0 })
  @IsOptional()
  @IsNumber()
  @Min(0.5)
  @Max(100)
  weightKg?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  photoUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
