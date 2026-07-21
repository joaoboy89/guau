import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PaymentsController } from "./payments.controller";
import { PaymentsService } from "./payments.service";
import { CryptoModule } from "../../common/crypto/crypto.module";
import { NotificationsModule } from "../notifications/notifications.module";

@Module({
  imports: [CryptoModule, JwtModule.register({}), NotificationsModule],
  controllers: [PaymentsController],
  providers: [PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
