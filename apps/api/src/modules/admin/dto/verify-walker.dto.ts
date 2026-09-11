import { IsIn, IsOptional, IsString, MaxLength } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export type VerifyWalkerAction = "approve" | "reject" | "suspend" | "reinstate";

const ACTIONS: VerifyWalkerAction[] = ["approve", "reject", "suspend", "reinstate"];

export class VerifyWalkerDto {
  @ApiProperty({ enum: ACTIONS })
  @IsIn(ACTIONS)
  action: VerifyWalkerAction;

  // Requerida para reject/suspend/reinstate, opcional para approve — el
  // service es quien exige esto por accion (AdminService.verifyWalker).
  @ApiPropertyOptional({ example: "Foto del DNI ilegible. Por favor resubir." })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
