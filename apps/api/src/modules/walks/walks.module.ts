import { Module } from "@nestjs/common";
import { WalksController } from "./walks.controller";
import { WalksService } from "./walks.service";

@Module({
  controllers: [WalksController],
  providers: [WalksService],
  exports: [WalksService],
})
export class WalksModule {}
