import { Controller, Get, Put, Post, Param, Body, Query, UseGuards } from "@nestjs/common";
import { ApiTags, ApiBearerAuth, ApiOperation } from "@nestjs/swagger";
import { AdminService } from "./admin.service";
import { VerifyWalkerDto } from "./dto/verify-walker.dto";
import { QueryAdminWalksDto } from "./dto/query-admin-walks.dto";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { UserRole } from "@prisma/client";

@ApiTags("Admin")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller("admin")
export class AdminController {
  constructor(private admin: AdminService) {}

  @Get("walkers/pending")
  @ApiOperation({ summary: "Paseadores pendientes de verificación de identidad" })
  getPendingWalkers() {
    return this.admin.getPendingWalkers();
  }

  @Put("walkers/:id/verify")
  @ApiOperation({ summary: "Aprobar o rechazar un paseador (incluir notas si se rechaza)" })
  verifyWalker(@Param("id") id: string, @Body() dto: VerifyWalkerDto) {
    return this.admin.verifyWalker(id, dto);
  }

  @Get("walks")
  @ApiOperation({ summary: "Todos los paseos de la plataforma con filtros y paginación" })
  getAllWalks(@Query() query: QueryAdminWalksDto) {
    return this.admin.getAllWalks(query);
  }

  @Get("stats")
  @ApiOperation({ summary: "Métricas generales: usuarios, paseos, revenue, paseadores activos" })
  getStats() {
    return this.admin.getStats();
  }

  @Post("payouts/process")
  @ApiOperation({ summary: "Procesar cobros semanales pendientes a paseadores" })
  processPayouts() {
    return this.admin.processPayouts();
  }
}
