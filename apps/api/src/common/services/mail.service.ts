import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Resend } from "resend";

@Injectable()
export class MailService {
  private readonly resend: Resend | null = null;
  private readonly from: string;
  private readonly logger = new Logger(MailService.name);

  constructor(private config: ConfigService) {
    const apiKey = config.get<string>("RESEND_API_KEY") ?? "";
    const isPlaceholder = !apiKey || apiKey.startsWith("re_placeholder") || apiKey === "your_resend_api_key";
    if (isPlaceholder) {
      this.logger.warn("RESEND_API_KEY no configurada — emails deshabilitados");
    } else {
      this.resend = new Resend(apiKey);
    }
    this.from = config.get<string>("EMAIL_FROM") ?? "Güau <noreply@resend.jbsaasapp.com>";
  }

  async sendVerificationEmail(to: string, firstName: string, token: string) {
    if (!this.resend) return;
    const url = `${this.config.get("API_URL")}/auth/verify-email/${token}`;

    await this.resend.emails.send({
      from: this.from,
      to,
      subject: "Verificá tu cuenta en Güau 🐾",
      html: `
        <h2>Hola ${firstName}!</h2>
        <p>Gracias por registrarte en Güau. Para activar tu cuenta, hacé clic en el siguiente enlace:</p>
        <a href="${url}" style="background:#f97316;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block;">
          Verificar cuenta
        </a>
        <p>El enlace expira en 24 horas.</p>
        <p>Si no creaste una cuenta, ignorá este email.</p>
      `,
    }).catch((err) => {
      this.logger.warn(`No se pudo enviar email de verificación a ${to}: ${err}`);
    });
  }

  async sendWelcomeEmail(to: string, firstName: string) {
    if (!this.resend) return;
    await this.resend.emails.send({
      from: this.from,
      to,
      subject: "¡Bienvenido a Güau! 🐾",
      html: `
        <h2>¡Bienvenido, ${firstName}!</h2>
        <p>Tu cuenta en Güau está verificada y lista para usar.</p>
        <a href="${this.config.get("NEXT_PUBLIC_API_URL")?.replace("3001", "3000")}"
           style="background:#f97316;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block;">
          Ir a Güau
        </a>
      `,
    }).catch((err) => {
      this.logger.warn(`No se pudo enviar email de bienvenida a ${to}: ${err}`);
    });
  }
}
