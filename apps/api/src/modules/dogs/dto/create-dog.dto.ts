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
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class CreateDogDto {
  @ApiProperty({ example: "Mochi" })
  @IsString()
  @MinLength(1)
  name: string;

  @ApiPropertyOptional({ example: "Labrador Retriever" })
  @IsOptional()
  @IsString()
  breed?: string;

  @ApiProperty({ example: "medium", enum: ["small", "medium", "large"] })
  @IsIn(["small", "medium", "large"])
  size: string;

  @ApiPropertyOptional({ example: 3 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(30)
  ageYears?: number;

  @ApiPropertyOptional({ example: 12.5 })
  @IsOptional()
  @IsNumber()
  @Min(0.5)
  @Max(100)
  weightKg?: number;

  @ApiPropertyOptional({ example: "https://storage.guau.com.ar/dogs/mochi.jpg" })
  @IsOptional()
  @IsString()
  photoUrl?: string;

  @ApiPropertyOptional({ example: "Le tiene miedo a los monopatines. Alérgico al pollo." })
  @IsOptional()
  @IsString()
  notes?: string;
}
