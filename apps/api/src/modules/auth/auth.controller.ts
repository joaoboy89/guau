import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  Res,
} from "@nestjs/common";
import { ApiTags, ApiBearerAuth, ApiOperation } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { Response } from "express";
import { AuthService } from "./auth.service";
import { RegisterOwnerDto } from "./dto/register-owner.dto";
import { RegisterWalkerDto } from "./dto/register-walker.dto";
import { LoginDto } from "./dto/login.dto";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";
import { JwtRefreshGuard } from "./guards/jwt-refresh.guard";
import { CurrentUser } from "../../common/decorators/current-user.decorator";

// Throttle estricto para endpoints sensibles a fuerza bruta / abuso de registro
const AUTH_THROTTLE = { default: { limit: 10, ttl: 60_000 } };

const COOKIE_BASE = {
  httpOnly: true,
  secure:   process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  domain:   process.env.COOKIE_DOMAIN || undefined,
  path:     "/",
};

@ApiTags("Auth")
@Controller("auth")
export class AuthController {
  constructor(private auth: AuthService) {}

  @Post("register/owner")
  @Throttle(AUTH_THROTTLE)
  @ApiOperation({ summary: "Registro de dueño" })
  registerOwner(@Body() dto: RegisterOwnerDto) {
    return this.auth.registerOwner(dto);
  }

  @Post("register/walker")
  @Throttle(AUTH_THROTTLE)
  @ApiOperation({ summary: "Registro de paseador" })
  registerWalker(@Body() dto: RegisterWalkerDto) {
    return this.auth.registerWalker(dto);
  }

  @Post("login")
  @Throttle(AUTH_THROTTLE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Login — setea cookies httpOnly y retorna perfil básico" })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { accessToken, refreshToken, user } = await this.auth.login(dto);
    res.cookie("access_token",  accessToken,  { ...COOKIE_BASE, maxAge: 15 * 60 * 1000 });
    res.cookie("refresh_token", refreshToken, { ...COOKIE_BASE, maxAge: 7 * 24 * 60 * 60 * 1000 });
    return user;
  }

  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtRefreshGuard)
  @ApiOperation({ summary: "Renovar tokens usando cookie de refresh" })
  async refresh(
    @CurrentUser() user: { sub: string; refreshToken: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    const { accessToken, refreshToken } = await this.auth.refreshTokens(user.sub, user.refreshToken);
    res.cookie("access_token",  accessToken,  { ...COOKIE_BASE, maxAge: 15 * 60 * 1000 });
    res.cookie("refresh_token", refreshToken, { ...COOKIE_BASE, maxAge: 7 * 24 * 60 * 60 * 1000 });
    return { message: "ok" };
  }

  @Post("logout")
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Cerrar sesión e invalidar refresh token" })
  async logout(
    @CurrentUser() user: { id: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.auth.logout(user.id);
    const clearOpts = { path: "/", domain: process.env.COOKIE_DOMAIN || undefined };
    res.clearCookie("access_token",  clearOpts);
    res.clearCookie("refresh_token", clearOpts);
    return { message: "Sesión cerrada" };
  }

  @Get("me")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Perfil básico del usuario autenticado (vía cookie)" })
  me(@CurrentUser() user: { id: string }) {
    return this.auth.getMe(user.id);
  }

  @Get("verify-email/:token")
  @ApiOperation({ summary: "Verificar email con token recibido por correo" })
  verifyEmail(@Param("token") token: string) {
    return this.auth.verifyEmail(token);
  }
}
