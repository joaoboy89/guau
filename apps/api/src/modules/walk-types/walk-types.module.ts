import { Module } from "@nestjs/common";
import { WalkTypesController } from "./walk-types.controller";
import { WalkTypesService } from "./walk-types.service";

@Module({
  controllers: [WalkTypesController],
  providers: [WalkTypesService],
})
export class WalkTypesModule {}
