import { Controller, Get, Put, Body, UseGuards } from "@nestjs/common";
import { ApiTags, ApiBearerAuth, ApiOperation } from "@nestjs/swagger";
import { OwnersService } from "./owners.service";
import { UpdateOwnerDto } from "./dto/update-owner.dto";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { UserRole } from "@prisma/client";

@ApiTags("Owners")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.OWNER, UserRole.ADMIN)
@Controller("owners")
export class OwnersController {
  constructor(private owners: OwnersService) {}

  @Get("me")
  @ApiOperation({ summary: "Obtener perfil propio del dueño" })
  getMe(@CurrentUser() user: { id: string }) {
    return this.owners.getMyProfile(user.id);
  }

  @Put("me")
  @ApiOperation({ summary: "Actualizar perfil del dueño (dirección, barrio, coords)" })
  updateMe(
    @CurrentUser() user: { id: string },
    @Body() dto: UpdateOwnerDto,
  ) {
    return this.owners.updateMyProfile(user.id, dto);
  }
}
