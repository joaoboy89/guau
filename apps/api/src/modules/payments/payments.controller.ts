import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  Headers,
  UseGuards,
  HttpCode,
  HttpStatus,
  Res,
} from "@nestjs/common";
import { ApiTags, ApiBearerAuth, ApiOperation, ApiExcludeEndpoint } from "@nestjs/swagger";
import { Response } from "express";
import { PaymentsService } from "./payments.service";
import { CreatePreferenceDto } from "./dto/create-preference.dto";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { UserRole } from "@prisma/client";
import { SkipThrottle } from "@nestjs/throttler";

interface AuthUser {
  id: string;
  role: string;
}

@ApiTags("Payments")
@Controller("payments")
export class PaymentsController {
  constructor(private payments: PaymentsService) {}

  // ─── Crear preferencia de pago (dueño) ───────────────────

  @Post("create-preference")
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER)
  @ApiOperation({ summary: "Iniciar el pago de un paseo confirmado — retorna URL de MercadoPago" })
  createPreference(@CurrentUser() user: AuthUser, @Body() dto: CreatePreferenceDto) {
    return this.payments.createPreference(user.id, dto);
  }

  // ─── Webhook de MercadoPago ──────────────────────────────

  @Post("webhook")
  @SkipThrottle()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Webhook de MercadoPago — no llamar directamente" })
  handleWebhook(
    @Body() body: Record<string, unknown>,
    @Headers("x-signature") xSignature: string,
    @Headers("x-request-id") xRequestId: string,
  ) {
    return this.payments.handleWebhook(body, xSignature, xRequestId);
  }

  // ─── Balance del paseador ────────────────────────────────

  @Get("walker-balance")
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.WALKER)
  @ApiOperation({ summary: "Balance y cobros del paseador autenticado" })
  getWalkerBalance(@CurrentUser() user: AuthUser) {
    return this.payments.getWalkerBalance(user.id);
  }

  // ─── OAuth: conectar cuenta MercadoPago (paseador) ───────

  @Get("walker-connect")
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.WALKER)
  @ApiOperation({ summary: "Obtener URL de autorización OAuth de MercadoPago" })
  getConnectUrl(@CurrentUser() user: AuthUser) {
    return this.payments.getWalkerConnectUrl(user.id);
  }

  // ─── OAuth callback (MP redirige aquí) ───────────────────

  @Get("walker-connect/callback")
  @ApiExcludeEndpoint()  // No mostrar en Swagger — es para MP
  async handleCallback(
    @Query("code") code: string,
    @Query("state") state: string,
    @Res() res: Response,
  ) {
    const result = await this.payments.handleWalkerCallback(code, state);
    return res.redirect(result.redirect);
  }
}
