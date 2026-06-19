import { IsString, IsBoolean, IsOptional, Matches } from "class-validator";
import { ApiPropertyOptional } from "@nestjs/swagger";

const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

export class UpdateScheduleDto {
  @ApiPropertyOptional({ example: "09:00" })
  @IsOptional()
  @IsString()
  @Matches(TIME_REGEX, { message: "startTime debe tener formato HH:MM" })
  startTime?: string;

  @ApiPropertyOptional({ example: "17:00" })
  @IsOptional()
  @IsString()
  @Matches(TIME_REGEX, { message: "endTime debe tener formato HH:MM" })
  endTime?: string;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
