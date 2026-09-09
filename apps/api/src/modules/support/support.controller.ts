import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from "@nestjs/common";
import { ApiTags, ApiBearerAuth, ApiOperation } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { UserRole } from "@prisma/client";
import { SupportService } from "./support.service";
import { QuerySupportWalksDto } from "./dto/query-support-walks.dto";
import { QuerySupportMessagesDto } from "./dto/query-support-messages.dto";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";

interface AuthUser {
  id: string;
  role: string;
}

// 10 por minuto, no las 100 del throttler global (decisión de Joa,
// docs/diseños/modulo-soporte.md §4): una persona resolviendo un caso hace
// 5-10 consultas por minuto. Si de golpe hay 100, o algo está roto o
// alguien está sacando datos.
const SUPPORT_THROTTLE = { default: { limit: 10, ttl: 60_000 } };

// Rebanada 1, solo lectura — módulo propio, hermano de admin/, no una parte
// de él (docs/diseños/modulo-soporte.md §1): ADMIN opera la plataforma,
// SOPORTE resuelve casos entre las partes — son trabajos distintos aunque
// hoy los haga la misma persona. Hoy @Roles(ADMIN) porque SUPPORT todavía
// no existe; el día que exista se suma acá y admin/ no se toca.
@ApiTags("Support")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Throttle(SUPPORT_THROTTLE)
@Controller("support")
export class SupportController {
  constructor(private support: SupportService) {}

  @Get("walks")
  @ApiOperation({ summary: "Buscar paseos — exige al menos un filtro, sin filtro devuelve vacío" })
  searchWalks(@Query() query: QuerySupportWalksDto) {
    return this.support.searchWalks(query);
  }

  @Get("walks/:id")
  @ApiOperation({ summary: "El caso completo de un paseo" })
  getCase(@Param("id", ParseUUIDPipe) id: string) {
    return this.support.getCase(id);
  }

  @Get("walks/:id/messages")
  @ApiOperation({ summary: "El chat del paseo — solo lectura, no marca mensajes como leídos" })
  getMessages(
    @Param("id", ParseUUIDPipe) id: string,
    @Query() query: QuerySupportMessagesDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.support.getMessages(id, query, user);
  }
}
