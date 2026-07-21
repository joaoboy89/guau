import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../../../database/prisma.service";

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  // Presente solo en tokens de propósito especial (ej. state de MP Connect).
  // Un access token real nunca lo trae.
  purpose?: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, "jwt") {
  constructor(
    config: ConfigService,
    private prisma: PrismaService
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req) => (req as { cookies?: { access_token?: string } })?.cookies?.access_token ?? null,
      ]),
      secretOrKey:      config.getOrThrow<string>("JWT_SECRET"),
      ignoreExpiration: false,
      passReqToCallback: false,
    });
  }

  async validate(payload: JwtPayload) {
    // Tokens firmados con JWT_SECRET pero con un propósito distinto (ej. state
    // OAuth de MP Connect) no deben poder autenticar como access token.
    if (payload.purpose) {
      throw new UnauthorizedException();
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, role: true, isActive: true },
    });

    if (!user || !user.isActive) throw new UnauthorizedException();
    return user;
  }
}
