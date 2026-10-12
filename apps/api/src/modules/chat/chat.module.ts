import { Module } from "@nestjs/common";
import { ChatController } from "./chat.controller";
import { ChatService } from "./chat.service";
import { TrackingModule } from "../tracking/tracking.module";
import { NotificationsModule } from "../notifications/notifications.module";

@Module({
  imports: [TrackingModule, NotificationsModule],
  controllers: [ChatController],
  providers: [ChatService],
  exports: [ChatService],
})
export class ChatModule {}
