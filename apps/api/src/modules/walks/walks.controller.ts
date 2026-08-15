import {
  Controller,
  Post,
  Get,
  Put,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { ApiTags, ApiBearerAuth, ApiOperation } from "@nestjs/swagger";
import { WalksService } from "./walks.service";
import { CreateWalkDto } from "./dto/create-walk.dto";
import { CancelWalkDto } from "./dto/cancel-walk.dto";
import { QueryWalksDto } from "./dto/query-walks.dto";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { UserRole } from "@prisma/client";

interface AuthUser {
  id: string;
  role: string;
}

@ApiTags("Walks")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("walks")
export class WalksController {
  constructor(private walks: WalksService) {}

  // ─── Crear reserva (solo dueño) ──────────────────────────

  @Post()
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER)
  @ApiOperation({ summary: "Crear una reserva de paseo" })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateWalkDto) {
    return this.walks.create(user.id, dto);
  }

  // ─── Mis paseos (dueño o paseador) ───────────────────────

  @Get()
  @ApiOperation({ summary: "Listar mis paseos (filtra por rol automáticamente)" })
  findAll(@CurrentUser() user: AuthUser, @Query() query: QueryWalksDto) {
    return this.walks.findMyWalks(user.id, user.role, query);
  }

  // ─── Detalle ─────────────────────────────────────────────

  @Get(":id")
  @ApiOperation({ summary: "Detalle de un paseo" })
  findOne(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.walks.findById(user.id, user.role, id);
  }

  // ─── Ruta GPS ────────────────────────────────────────────

  @Get(":id/locations")
  @ApiOperation({ summary: "Ruta GPS grabada del paseo" })
  getLocations(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.walks.getLocations(user.id, user.role, id);
  }

  // ─── Transiciones de estado (solo paseador) ──────────────

  @Put(":id/confirm")
  @UseGuards(RolesGuard)
  @Roles(UserRole.WALKER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Paseador confirma la reserva (PENDING → CONFIRMED)" })
  confirm(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.walks.confirm(user.id, id);
  }

  @Put(":id/reject")
  @UseGuards(RolesGuard)
  @Roles(UserRole.WALKER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Paseador rechaza la reserva (PENDING → CANCELLED_WALKER)" })
  reject(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.walks.reject(user.id, id);
  }

  @Put(":id/on-way")
  @UseGuards(RolesGuard)
  @Roles(UserRole.WALKER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Paseador sale hacia el pickup (CONFIRMED → WALKER_ON_WAY)" })
  onWay(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.walks.markOnWay(user.id, id);
  }

  @Put(":id/start")
  @UseGuards(RolesGuard)
  @Roles(UserRole.WALKER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Iniciar el paseo (WALKER_ON_WAY → IN_PROGRESS)" })
  start(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.walks.start(user.id, id);
  }

  @Put(":id/finish")
  @UseGuards(RolesGuard)
  @Roles(UserRole.WALKER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Finalizar el paseo (IN_PROGRESS → COMPLETED)" })
  finish(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.walks.finish(user.id, id);
  }

  // ─── Cancelar (dueño o paseador) ─────────────────────────

  @Put(":id/cancel")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Cancelar el paseo — disponible en PENDING y CONFIRMED" })
  cancel(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() dto: CancelWalkDto,
  ) {
    return this.walks.cancel(user.id, user.role, id, dto);
  }

  // ─── Reclamos y cierre (solo dueño) ──────────────────────

  @Put(":id/report-walker-no-show")
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      "Dueño reporta que el paseador no se presentó (CONFIRMED/WALKER_ON_WAY → NOT_PERFORMED). Desde T+10m, no vence.",
  })
  reportWalkerNoShow(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.walks.reportWalkerNoShow(user.id, id);
  }

  @Put(":id/confirm-receipt")
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Dueño confirma que recibió a su perro (IN_PROGRESS → COMPLETED). Llave de escape del bloqueo.",
  })
  confirmReceipt(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.walks.confirmReceipt(user.id, id);
  }
}
