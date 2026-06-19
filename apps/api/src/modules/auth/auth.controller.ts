import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { ApiTags, ApiBearerAuth, ApiOperation } from "@nestjs/swagger";
import { AuthService } from "./auth.service";
import { RegisterOwnerDto } from "./dto/register-owner.dto";
import { RegisterWalkerDto } from "./dto/register-walker.dto";
import { LoginDto } from "./dto/login.dto";
import { RefreshTokenDto } from "./dto/refresh-token.dto";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";
import { JwtRefreshGuard } from "./guards/jwt-refresh.guard";
import { CurrentUser } from "../../common/decorators/current-user.decorator";

@ApiTags("Auth")
@Controller("auth")
export class AuthController {
  constructor(private auth: AuthService) {}

  @Post("register/owner")
  @ApiOperation({ summary: "Registro de dueño" })
  registerOwner(@Body() dto: RegisterOwnerDto) {
    return this.auth.registerOwner(dto);
  }

  @Post("register/walker")
  @ApiOperation({ summary: "Registro de paseador" })
  registerWalker(@Body() dto: RegisterWalkerDto) {
    return this.auth.registerWalker(dto);
  }

  @Post("login")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Login — retorna JWT + refresh token" })
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtRefreshGuard)
  @ApiOperation({ summary: "Renovar access token con refresh token" })
  refresh(
    @CurrentUser() user: { sub: string; refreshToken: string },
    @Body() _dto: RefreshTokenDto,
  ) {
    return this.auth.refreshTokens(user.sub, user.refreshToken);
  }

  @Post("logout")
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Cerrar sesión e invalidar refresh token" })
  logout(@CurrentUser() user: { id: string }) {
    return this.auth.logout(user.id);
  }

  @Get("verify-email/:token")
  @ApiOperation({ summary: "Verificar email con token recibido por correo" })
  verifyEmail(@Param("token") token: string) {
    return this.auth.verifyEmail(token);
  }
}
