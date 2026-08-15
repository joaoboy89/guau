import { Module } from "@nestjs/common";
import { WalksController } from "./walks.controller";
import { WalksService } from "./walks.service";
import { WalkRemindersService } from "./walk-reminders.service";
import { WalkExpirationService } from "./walk-expiration.service";
import { TrackingModule } from "../tracking/tracking.module";
import { ChatModule } from "../chat/chat.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { MailService } from "../../common/services/mail.service";

@Module({
  imports: [TrackingModule, ChatModule, NotificationsModule],
  controllers: [WalksController],
  providers: [WalksService, WalkRemindersService, WalkExpirationService, MailService],
  exports: [WalksService],
})
export class WalksModule {}
