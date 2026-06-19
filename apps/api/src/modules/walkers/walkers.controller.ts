import {
  Controller,
  Get,
  Put,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiTags, ApiBearerAuth, ApiOperation } from "@nestjs/swagger";
import { WalkersService } from "./walkers.service";
import { UpdateWalkerDto } from "./dto/update-walker.dto";
import { UpdateAvailabilityDto } from "./dto/update-availability.dto";
import { CreateScheduleDto } from "./dto/create-schedule.dto";
import { UpdateScheduleDto } from "./dto/update-schedule.dto";
import { SetZoneDto } from "./dto/set-zone.dto";
import { SearchWalkersDto } from "./dto/search-walkers.dto";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { UserRole } from "@prisma/client";

@ApiTags("Walkers")
@Controller("walkers")
export class WalkersController {
  constructor(private walkers: WalkersService) {}

  // ─── Rutas públicas ──────────────────────────────────────

  @Get()
  @ApiOperation({ summary: "Buscar paseadores por ubicación, fecha y tipo de paseo" })
  search(@Query() query: SearchWalkersDto) {
    return this.walkers.search(query);
  }

  @Get(":id")
  @ApiOperation({ summary: "Ver perfil público de un paseador" })
  getPublicProfile(@Param("id") id: string) {
    return this.walkers.getPublicProfile(id);
  }

  // ─── Rutas autenticadas (solo WALKER) ───────────────────

  @Get("me/profile")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.WALKER)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Ver mi perfil de paseador" })
  getMe(@CurrentUser() user: { id: string }) {
    return this.walkers.getMyProfile(user.id);
  }

  @Put("me/profile")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.WALKER)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Actualizar mi perfil (bio, maxDogsPerWalk)" })
  updateMe(
    @CurrentUser() user: { id: string },
    @Body() dto: UpdateWalkerDto,
  ) {
    return this.walkers.updateMyProfile(user.id, dto);
  }

  @Put("me/availability")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.WALKER)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Activar/desactivar disponibilidad" })
  updateAvailability(
    @CurrentUser() user: { id: string },
    @Body() dto: UpdateAvailabilityDto,
  ) {
    return this.walkers.updateAvailability(user.id, dto);
  }

  @Post("me/schedules")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.WALKER)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Agregar horario disponible (día + rango horario)" })
  createSchedule(
    @CurrentUser() user: { id: string },
    @Body() dto: CreateScheduleDto,
  ) {
    return this.walkers.createSchedule(user.id, dto);
  }

  @Put("me/schedules/:scheduleId")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.WALKER)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Editar un horario existente" })
  updateSchedule(
    @CurrentUser() user: { id: string },
    @Param("scheduleId") scheduleId: string,
    @Body() dto: UpdateScheduleDto,
  ) {
    return this.walkers.updateSchedule(user.id, scheduleId, dto);
  }

  @Post("me/zone")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.WALKER)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Definir zona de operación (centro + radio en km)" })
  setZone(
    @CurrentUser() user: { id: string },
    @Body() dto: SetZoneDto,
  ) {
    return this.walkers.setZone(user.id, dto);
  }
}
