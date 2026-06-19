import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { ApiTags, ApiBearerAuth, ApiOperation } from "@nestjs/swagger";
import { DogsService } from "./dogs.service";
import { CreateDogDto } from "./dto/create-dog.dto";
import { UpdateDogDto } from "./dto/update-dog.dto";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { UserRole } from "@prisma/client";

@ApiTags("Dogs")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.OWNER)
@Controller("dogs")
export class DogsController {
  constructor(private dogs: DogsService) {}

  @Get()
  @ApiOperation({ summary: "Listar mis perros activos" })
  findAll(@CurrentUser() user: { id: string }) {
    return this.dogs.findMyDogs(user.id);
  }

  @Post()
  @ApiOperation({ summary: "Agregar un perro" })
  create(
    @CurrentUser() user: { id: string },
    @Body() dto: CreateDogDto,
  ) {
    return this.dogs.create(user.id, dto);
  }

  @Put(":id")
  @ApiOperation({ summary: "Editar datos de un perro" })
  update(
    @CurrentUser() user: { id: string },
    @Param("id") id: string,
    @Body() dto: UpdateDogDto,
  ) {
    return this.dogs.update(user.id, id, dto);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Desactivar un perro (soft delete)" })
  deactivate(
    @CurrentUser() user: { id: string },
    @Param("id") id: string,
  ) {
    return this.dogs.deactivate(user.id, id);
  }
}
