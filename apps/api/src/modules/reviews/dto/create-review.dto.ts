import { IsString, IsInt, IsOptional, Min, Max, MaxLength } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class CreateReviewDto {
  @ApiProperty({ description: "ID del paseo a calificar" })
  @IsString()
  walkId: string;

  @ApiProperty({ description: "ID del usuario a calificar (el otro participante del paseo)" })
  @IsString()
  revieweeId: string;

  @ApiProperty({ example: 5, minimum: 1, maximum: 5 })
  @IsInt()
  @Min(1)
  @Max(5)
  rating: number;

  @ApiPropertyOptional({ example: "Muy puntual y los perros llegaron felices y cansados 🐾" })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  comment?: string;
}
