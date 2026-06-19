import { Module } from "@nestjs/common";
import { WalksController } from "./walks.controller";
import { WalksService } from "./walks.service";
import { TrackingModule } from "../tracking/tracking.module";
import { ChatModule } from "../chat/chat.module";
import { NotificationsModule } from "../notifications/notifications.module";

@Module({
  imports: [TrackingModule, ChatModule, NotificationsModule],
  controllers: [WalksController],
  providers: [WalksService],
  exports: [WalksService],
})
export class WalksModule {}
