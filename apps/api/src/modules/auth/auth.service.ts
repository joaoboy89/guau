import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  BadRequestException,
  ForbiddenException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../../database/prisma.service";
import { UsersService } from "../users/users.service";
import { MailService } from "../../common/services/mail.service";
import { RegisterOwnerDto } from "./dto/register-owner.dto";
import { RegisterWalkerDto } from "./dto/register-walker.dto";
import { LoginDto } from "./dto/login.dto";
import { UserRole } from "@prisma/client";
import * as bcrypt from "bcryptjs";

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private users: UsersService,
    private jwt: JwtService,
    private config: ConfigService,
    private mail: MailService,
  ) {}

  // ─── Registro Dueño ──────────────────────────────────────

  async registerOwner(dto: RegisterOwnerDto) {
    const existing = await this.users.findByEmail(dto.email);
    if (existing) throw new ConflictException("El email ya está registrado");

    const passwordHash = await bcrypt.hash(dto.password, 12);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        firstName: dto.firstName,
        lastName: dto.lastName,
        phone: dto.phone,
        role: UserRole.OWNER,
        ownerProfile: { create: {} },
      },
    });

    const verificationToken = this.signEmailToken(user.id);
    this.mail.sendVerificationEmail(user.email, user.firstName, verificationToken);

    return { message: "Registro exitoso. Revisá tu email para verificar la cuenta." };
  }

  // ─── Registro Paseador ───────────────────────────────────

  async registerWalker(dto: RegisterWalkerDto) {
    const existing = await this.users.findByEmail(dto.email);
    if (existing) throw new ConflictException("El email ya está registrado");

    const passwordHash = await bcrypt.hash(dto.password, 12);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        firstName: dto.firstName,
        lastName: dto.lastName,
        phone: dto.phone,
        role: UserRole.WALKER,
        walkerProfile: {
          create: { bio: dto.bio ?? null },
        },
      },
    });

    const verificationToken = this.signEmailToken(user.id);
    this.mail.sendVerificationEmail(user.email, user.firstName, verificationToken);

    return { message: "Registro exitoso. Revisá tu email para verificar la cuenta." };
  }

  // ─── Login ───────────────────────────────────────────────

  async login(dto: LoginDto) {
    const user = await this.users.findByEmail(dto.email);
    if (!user || !user.isActive) throw new UnauthorizedException("Credenciales inválidas");

    const passwordMatch = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordMatch) throw new UnauthorizedException("Credenciales inválidas");

    if (!user.emailVerifiedAt) {
      throw new ForbiddenException("Debés verificar tu email antes de ingresar");
    }

    const tokens = await this.generateTokens(user.id, user.email, user.role);
    return tokens;
  }

  // ─── Refresh ─────────────────────────────────────────────

  async refreshTokens(userId: string, refreshToken: string) {
    const user = await this.users.findById(userId);
    if (!user || !user.refreshTokenHash) throw new UnauthorizedException();

    const tokenMatch = await bcrypt.compare(refreshToken, user.refreshTokenHash);
    if (!tokenMatch) throw new UnauthorizedException("Refresh token inválido");

    return this.generateTokens(user.id, user.email, user.role);
  }

  // ─── Logout ──────────────────────────────────────────────

  async logout(userId: string) {
    await this.users.updateRefreshTokenHash(userId, null);
    return { message: "Sesión cerrada" };
  }

  // ─── Verificación de email ───────────────────────────────

  async verifyEmail(token: string) {
    let payload: { sub: string };
    try {
      payload = this.jwt.verify(token, {
        secret: this.config.getOrThrow<string>("JWT_EMAIL_SECRET"),
      });
    } catch {
      throw new BadRequestException("Token inválido o expirado");
    }

    const user = await this.users.findById(payload.sub);
    if (!user) throw new BadRequestException("Usuario no encontrado");
    if (user.emailVerifiedAt) return { message: "Email ya verificado previamente", role: user.role };

    await this.users.markEmailVerified(user.id);
    this.mail.sendWelcomeEmail(user.email, user.firstName, user.role);

    return { message: "Cuenta verificada. Ya podés ingresar a Güau.", role: user.role };
  }

  // ─── Helpers privados ────────────────────────────────────

  private signEmailToken(userId: string): string {
    return this.jwt.sign(
      { sub: userId },
      {
        secret: this.config.getOrThrow<string>("JWT_EMAIL_SECRET"),
        expiresIn: "24h",
      }
    );
  }

  private async generateTokens(userId: string, email: string, role: string) {
    const payload = { sub: userId, email, role };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(payload, {
        secret: this.config.getOrThrow<string>("JWT_SECRET"),
        expiresIn: this.config.get<string>("JWT_EXPIRES_IN") ?? "15m",
      }),
      this.jwt.signAsync(payload, {
        secret: this.config.getOrThrow<string>("JWT_REFRESH_SECRET"),
        expiresIn: this.config.get<string>("JWT_REFRESH_EXPIRES_IN") ?? "7d",
      }),
    ]);

    const hash = await bcrypt.hash(refreshToken, 10);
    await this.users.updateRefreshTokenHash(userId, hash);

    return { accessToken, refreshToken };
  }
}
