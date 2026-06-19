import { IsOptional, IsIn, IsString, IsInt, Min, Max } from "class-validator";
import { Type } from "class-transformer";
import { ApiPropertyOptional } from "@nestjs/swagger";

const WALK_STATUSES = [
  "PENDING", "CONFIRMED", "WALKER_ON_WAY",
  "IN_PROGRESS", "COMPLETED", "CANCELLED_OWNER", "CANCELLED_WALKER",
];

export class QueryAdminWalksDto {
  @ApiPropertyOptional({ enum: WALK_STATUSES })
  @IsOptional()
  @IsIn(WALK_STATUSES)
  status?: string;

  @ApiPropertyOptional({ description: "Filtrar por WalkerProfile ID" })
  @IsOptional()
  @IsString()
  walkerId?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
