import { IsEmail, IsString, MinLength, IsOptional } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class RegisterWalkerDto {
  @ApiProperty({ example: "maria@email.com" })
  @IsEmail()
  email: string;

  @ApiProperty({ example: "MiPassword123!" })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiProperty({ example: "María" })
  @IsString()
  firstName: string;

  @ApiProperty({ example: "López" })
  @IsString()
  lastName: string;

  @ApiPropertyOptional({ example: "+5491133445566" })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ example: "Paseadora con 3 años de experiencia en Palermo." })
  @IsOptional()
  @IsString()
  bio?: string;
}
