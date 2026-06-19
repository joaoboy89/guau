import { IsInt, Min, Max, IsString, Matches } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

export class CreateScheduleDto {
  @ApiProperty({ example: 1, description: "0=Dom, 1=Lun, ..., 6=Sáb" })
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek: number;

  @ApiProperty({ example: "08:00" })
  @IsString()
  @Matches(TIME_REGEX, { message: "startTime debe tener formato HH:MM" })
  startTime: string;

  @ApiProperty({ example: "14:00" })
  @IsString()
  @Matches(TIME_REGEX, { message: "endTime debe tener formato HH:MM" })
  endTime: string;
}
