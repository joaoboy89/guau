import { IsString, IsUUID } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class CreatePreferenceDto {
  @ApiProperty({ description: "ID del paseo a pagar" })
  @IsString()
  @IsUUID()
  walkId: string;
}
