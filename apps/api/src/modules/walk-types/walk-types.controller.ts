import { Controller, Get } from "@nestjs/common";
import { ApiTags, ApiOperation } from "@nestjs/swagger";
import { WalkTypesService } from "./walk-types.service";

@ApiTags("WalkTypes")
@Controller("walk-types")
export class WalkTypesController {
  constructor(private walkTypes: WalkTypesService) {}

  @Get()
  @ApiOperation({ summary: "Listar tipos de paseo activos" })
  findAll() {
    return this.walkTypes.findActive();
  }
}
