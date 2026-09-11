import { IsIn, IsInt, IsOptional, Max, Min } from "class-validator";
import { Type } from "class-transformer";
import { ApiPropertyOptional } from "@nestjs/swagger";
import { VerificationStatus } from "@prisma/client";

const STATUSES = Object.values(VerificationStatus);

export class QueryWalkersDto {
  // Sin status, la pantalla no sabria que tab esta pidiendo — PENDING es el
  // default porque es el caso de todos los dias (paseador recien registrado).
  @ApiPropertyOptional({ enum: STATUSES, default: VerificationStatus.PENDING })
  @IsOptional()
  @IsIn(STATUSES)
  status?: VerificationStatus = VerificationStatus.PENDING;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 20;
}
