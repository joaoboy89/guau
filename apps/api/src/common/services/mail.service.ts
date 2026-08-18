import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Resend } from "resend";

@Injectable()
export class MailService {
  private readonly resend: Resend | null = null;
  private readonly from: string;
  private readonly adminAlertEmail: string;
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
    // Sin default hardcodeado a proposito: si falta, sendNotPerformedAlert
    // avisa por warning y no manda nada — que falte una alerta no puede
    // romper el job que limpia paseos colgados.
    this.adminAlertEmail = config.get<string>("ADMIN_ALERT_EMAIL") ?? "";
  }

  sendVerificationEmail(to: string, firstName: string, token: string): void {
    if (!this.resend) return;
    const url = `${this.config.get("FRONTEND_URL")}/verify-email?token=${token}`;

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Verificá tu cuenta en Güau</title>
</head>
<body style="margin:0;padding:0;background-color:#f0f0f4;font-family:Arial,Helvetica,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background-color:#f0f0f4;padding:32px 0">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" role="presentation" style="background:#ffffff;border-radius:8px;overflow:hidden;max-width:560px;width:100%">

        <tr><td style="background-color:#1a1a2e;padding:24px 40px">
          <span style="color:#00a89c;font-size:26px;font-weight:800;letter-spacing:-0.5px">Güau</span>
        </td></tr>

        <tr><td style="padding:32px 40px 24px;color:#333333">
          <p style="margin:0 0 12px 0;font-size:16px;font-weight:600">Hola ${firstName},</p>
          <p style="margin:0 0 24px 0;font-size:15px;line-height:1.6;color:#555555">
            Gracias por registrarte en Güau. Para activar tu cuenta hacé clic en el botón:
          </p>
          <table cellpadding="0" cellspacing="0" role="presentation">
            <tr>
              <td style="background-color:#00a89c;border-radius:6px">
                <a href="${url}"
                   style="display:block;padding:14px 32px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;white-space:nowrap">
                  Verificar mi cuenta
                </a>
              </td>
            </tr>
          </table>
          <p style="margin:24px 0 4px 0;font-size:12px;color:#999999">Si el botón no funciona, copiá este enlace:</p>
          <p style="margin:0 0 24px 0;font-size:12px;color:#999999;word-break:break-all">${url}</p>
          <p style="margin:0;font-size:13px;color:#888888">El enlace expira en 24 horas.</p>
        </td></tr>

        <tr><td style="padding:16px 40px 24px;border-top:1px solid #eeeeee">
          <p style="margin:0;font-size:12px;color:#aaaaaa;line-height:1.5">
            Recibiste este mensaje porque te registraste en Güau con esta dirección de correo.<br>
            Si no fuiste vos, podés ignorar este mensaje sin problema.
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

    const text = `Hola ${firstName},

Para verificar tu cuenta en Güau ingresá al siguiente enlace:

${url}

El enlace expira en 24 horas.
Si no te registraste en Güau, ignorá este mensaje.

-- Güau, paseo de perros en Buenos Aires`;

    this.resend.emails
      .send({ from: this.from, to, subject: "Verificá tu cuenta en Güau", html, text })
      .catch((err) => {
        this.logger.warn(`No se pudo enviar email de verificación a ${to}: ${err}`);
      });
  }

  sendWelcomeEmail(to: string, firstName: string, role: string): void {
    if (!this.resend) return;
    const frontendUrl = this.config.get<string>("FRONTEND_URL") ?? "";

    const isWalker = role === "WALKER";

    const headline = isWalker
      ? "Ya podés empezar a ganar paseando perros"
      : "Ya podés buscar un paseador para tu perro";

    const body = isWalker
      ? `Completá tu perfil de paseador para aparecer en los resultados y empezar a recibir solicitudes de paseo.`
      : `Encontrá paseadores verificados cerca tuyo, reservá un paseo y seguí a tu perro en tiempo real.`;

    const ctaLabel = isWalker ? "Completar mi perfil" : "Buscar un paseador";
    const ctaUrl   = isWalker ? `${frontendUrl}/dashboard` : `${frontendUrl}/dashboard`;

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Bienvenido a Güau</title>
</head>
<body style="margin:0;padding:0;background-color:#f0f0f4;font-family:Arial,Helvetica,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background-color:#f0f0f4;padding:32px 0">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" role="presentation" style="background:#ffffff;border-radius:8px;overflow:hidden;max-width:560px;width:100%">

        <tr><td style="background-color:#1a1a2e;padding:24px 40px">
          <span style="color:#00a89c;font-size:26px;font-weight:800;letter-spacing:-0.5px">Güau</span>
        </td></tr>

        <tr><td style="padding:32px 40px 24px;color:#333333">
          <p style="margin:0 0 12px 0;font-size:16px;font-weight:600">Hola ${firstName},</p>
          <p style="margin:0 0 8px 0;font-size:18px;font-weight:700;color:#1a1a2e">${headline}</p>
          <p style="margin:0 0 24px 0;font-size:15px;line-height:1.6;color:#555555">${body}</p>
          <table cellpadding="0" cellspacing="0" role="presentation">
            <tr>
              <td style="background-color:#00a89c;border-radius:6px">
                <a href="${ctaUrl}"
                   style="display:block;padding:14px 32px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;white-space:nowrap">
                  ${ctaLabel}
                </a>
              </td>
            </tr>
          </table>
        </td></tr>

        <tr><td style="padding:16px 40px 24px;border-top:1px solid #eeeeee">
          <p style="margin:0;font-size:12px;color:#aaaaaa;line-height:1.5">
            Recibiste este mensaje porque te registraste en Güau con esta dirección de correo.
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

    const text = isWalker
      ? `Hola ${firstName},\n\n${headline}\n\n${body}\n\nIngresá a tu perfil: ${ctaUrl}\n\n-- Güau`
      : `Hola ${firstName},\n\n${headline}\n\n${body}\n\nIngresá a Güau: ${ctaUrl}\n\n-- Güau`;

    this.resend.emails
      .send({ from: this.from, to, subject: `Bienvenido a Güau, ${firstName}`, html, text })
      .catch((err) => {
        this.logger.warn(`No se pudo enviar email de bienvenida a ${to}: ${err}`);
      });
  }

  /**
   * La primera alerta que tiene el sistema. Solo se llama para paseos
   * NOT_PERFORMED con plata adentro — un NOT_PERFORMED sin pagar no necesita
   * que nadie intervenga. El mail avisa, nada mas: ningun refund se dispara
   * desde acá, la plata la mueve Joa a mano desde el panel de admin.
   */
  sendNotPerformedAlert(details: {
    walkId: string;
    reason: string;
    scheduledAt: Date;
    totalAmount: number;
    ownerName: string;
    ownerEmail: string;
    walkerName: string;
  }): void {
    // Chequeo primero, aunque el mail esté deshabilitado por completo: es la
    // condición que este job necesita que quede visible en el log, no la
    // configuración general de Resend (esa ya avisó una vez al arrancar).
    if (!this.adminAlertEmail) {
      this.logger.warn(
        `ADMIN_ALERT_EMAIL no configurada — no se pudo avisar del paseo no realizado ${details.walkId} (tiene plata adentro)`,
      );
      return;
    }
    if (!this.resend) return;

    const dateStr = details.scheduledAt.toLocaleString("es-AR", {
      dateStyle: "long",
      timeStyle: "short",
      timeZone: "America/Argentina/Buenos_Aires",
    });

    const html = `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:24px;background-color:#f0f0f4;font-family:Arial,Helvetica,sans-serif;color:#333333">
  <table width="560" cellpadding="0" cellspacing="0" role="presentation" style="background:#ffffff;border-radius:8px;padding:24px 32px;max-width:560px">
    <tr><td>
      <p style="margin:0 0 16px 0;font-size:16px;font-weight:700;color:#b91c1c">⚠️ Paseo no realizado — tiene plata adentro</p>
      <p style="margin:0 0 4px 0;font-size:14px"><strong>Motivo:</strong> ${details.reason}</p>
      <p style="margin:0 0 4px 0;font-size:14px"><strong>Agendado para:</strong> ${dateStr}</p>
      <p style="margin:0 0 4px 0;font-size:14px"><strong>Monto:</strong> $${details.totalAmount.toLocaleString("es-AR")}</p>
      <p style="margin:0 0 4px 0;font-size:14px"><strong>Dueño:</strong> ${details.ownerName} (${details.ownerEmail})</p>
      <p style="margin:0 0 16px 0;font-size:14px"><strong>Paseador:</strong> ${details.walkerName}</p>
      <p style="margin:0;font-size:12px;color:#888888">walkId: ${details.walkId} — ningún reembolso se disparó automáticamente.</p>
    </td></tr>
  </table>
</body>
</html>`;

    const text = `Paseo no realizado — tiene plata adentro

Motivo: ${details.reason}
Agendado para: ${dateStr}
Monto: $${details.totalAmount.toLocaleString("es-AR")}
Dueño: ${details.ownerName} (${details.ownerEmail})
Paseador: ${details.walkerName}
walkId: ${details.walkId}

Ningún reembolso se disparó automáticamente.`;

    this.resend.emails
      .send({
        from: this.from,
        to: this.adminAlertEmail,
        subject: `Paseo no realizado con plata adentro — ${details.reason}`,
        html,
        text,
      })
      .catch((err) => {
        this.logger.error(`No se pudo mandar la alerta de walk ${details.walkId}: ${err}`);
      });
  }
}
