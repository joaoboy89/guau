import { IsIn, IsOptional, IsString, MaxLength } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class VerifyWalkerDto {
  @ApiProperty({ enum: ["approve", "reject"] })
  @IsIn(["approve", "reject"])
  action: "approve" | "reject";

  @ApiPropertyOptional({ example: "Foto del DNI ilegible. Por favor resubir." })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
