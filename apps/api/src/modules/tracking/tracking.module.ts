import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { TrackingGateway } from "./tracking.gateway";
import { TrackingService } from "./tracking.service";

@Module({
  imports: [JwtModule.register({})],
  providers: [TrackingGateway, TrackingService],
  exports: [TrackingGateway],
})
export class TrackingModule {}
