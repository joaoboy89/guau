import { Controller, Get, Put, Post, Param, ParseUUIDPipe, Query, Body, UseGuards } from "@nestjs/common";
import { ApiTags, ApiBearerAuth, ApiOperation } from "@nestjs/swagger";
import { AdminService } from "./admin.service";
import { PaymentsService } from "../payments/payments.service";
import { VerifyWalkerDto } from "./dto/verify-walker.dto";
import { QueryWalkersDto } from "./dto/query-walkers.dto";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { UserRole } from "@prisma/client";

interface AuthUser {
  id: string;
  email: string;
  role: string;
}

@ApiTags("Admin")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller("admin")
export class AdminController {
  constructor(
    private admin: AdminService,
    private payments: PaymentsService,
  ) {}

  @Get("walkers")
  @ApiOperation({ summary: "Paseadores por estado de verificacion de identidad (PENDING por defecto)" })
  getWalkers(@Query() query: QueryWalkersDto) {
    return this.admin.getWalkers(query);
  }

  @Put("walkers/:id/verify")
  @ApiOperation({ summary: "Verificar identidad: aprobar, rechazar, suspender o reactivar un paseador" })
  verifyWalker(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: VerifyWalkerDto,
    @CurrentUser() admin: AuthUser,
  ) {
    return this.admin.verifyWalker(id, dto, admin.id, admin.email);
  }

  @Get("stats")
  @ApiOperation({ summary: "Métricas generales: usuarios, paseos, revenue, paseadores activos" })
  getStats() {
    return this.admin.getStats();
  }

  @Post("walks/:id/refund")
  @ApiOperation({
    summary: "Reembolso total del pago de un paseo (ej. no-show del paseador) — sin acción del vendedor",
  })
  refundWalk(@Param("id", ParseUUIDPipe) id: string) {
    return this.payments.refundWalkPayment(id);
  }
}
