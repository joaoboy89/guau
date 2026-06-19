import { IsEmail, IsString, MinLength, IsOptional, IsPhoneNumber } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class RegisterOwnerDto {
  @ApiProperty({ example: "juan@email.com" })
  @IsEmail()
  email: string;

  @ApiProperty({ example: "MiPassword123!" })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiProperty({ example: "Juan" })
  @IsString()
  firstName: string;

  @ApiProperty({ example: "García" })
  @IsString()
  lastName: string;

  @ApiPropertyOptional({ example: "+5491122334455" })
  @IsOptional()
  @IsString()
  phone?: string;
}
