import { Module } from "@nestjs/common";
import { WalkersController } from "./walkers.controller";
import { WalkersService } from "./walkers.service";

@Module({
  controllers: [WalkersController],
  providers: [WalkersService],
  exports: [WalkersService],
})
export class WalkersModule {}
