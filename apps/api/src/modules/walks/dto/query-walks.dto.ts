import { IsOptional, IsIn } from "class-validator";
import { ApiPropertyOptional } from "@nestjs/swagger";

export class QueryWalksDto {
  @ApiPropertyOptional({
    enum: [
      "PENDING", "CONFIRMED", "WALKER_ON_WAY",
      "IN_PROGRESS", "COMPLETED", "CANCELLED_OWNER", "CANCELLED_WALKER",
    ],
  })
  @IsOptional()
  @IsIn([
    "PENDING", "CONFIRMED", "WALKER_ON_WAY",
    "IN_PROGRESS", "COMPLETED", "CANCELLED_OWNER", "CANCELLED_WALKER",
  ])
  status?: string;
}
