import { IsEmail, IsString } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class LoginDto {
  @ApiProperty({ example: "juan@email.com" })
  @IsEmail()
  email: string;

  @ApiProperty({ example: "MiPassword123!" })
  @IsString()
  password: string;
}
