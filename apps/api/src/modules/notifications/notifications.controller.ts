import { Controller, Get, Put, Param, UseGuards } from "@nestjs/common";
import { ApiTags, ApiBearerAuth, ApiOperation } from "@nestjs/swagger";
import { NotificationsService } from "./notifications.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../../common/decorators/current-user.decorator";

@ApiTags("Notifications")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("notifications")
export class NotificationsController {
  constructor(private notifications: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: "Mis últimas 50 notificaciones" })
  getAll(@CurrentUser() user: { id: string }) {
    return this.notifications.getMyNotifications(user.id);
  }

  @Put(":id/read")
  @ApiOperation({ summary: "Marcar una notificación como leída" })
  markAsRead(
    @CurrentUser() user: { id: string },
    @Param("id") id: string,
  ) {
    return this.notifications.markAsRead(user.id, id);
  }
}
