import { Injectable, Logger } from "@nestjs/common";
import * as crypto from "crypto";

const ALGO = "aes-256-gcm";
const IV_BYTES = 12;
const TAG_BYTES = 16;

@Injectable()
export class CryptoService {
  private readonly logger = new Logger(CryptoService.name);
  private readonly key: Buffer;

  constructor() {
    const hex = process.env.ENCRYPTION_KEY ?? "";
    if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
      throw new Error(
        "ENCRYPTION_KEY debe ser de 64 caracteres hexadecimales (32 bytes). " +
        "Generá uno con: openssl rand -hex 32",
      );
    }
    this.key = Buffer.from(hex, "hex");
  }

  encrypt(plaintext: string): string {
    const iv = crypto.randomBytes(IV_BYTES);
    const cipher = crypto.createCipheriv(ALGO, this.key, iv, { authTagLength: TAG_BYTES });
    const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${iv.toString("hex")}:${tag.toString("hex")}:${ciphertext.toString("hex")}`;
  }

  decrypt(payload: string): string {
    const parts = payload.split(":");
    if (parts.length !== 3) {
      this.logger.warn(
        "mpAccessToken no tiene formato de cifrado — token legacy detectado; tratando como no conectado",
      );
      return "";
    }
    const [ivHex, tagHex, ciphertextHex] = parts;
    const iv = Buffer.from(ivHex, "hex");
    const tag = Buffer.from(tagHex, "hex");
    const ciphertext = Buffer.from(ciphertextHex, "hex");
    try {
      const decipher = crypto.createDecipheriv(ALGO, this.key, iv, { authTagLength: TAG_BYTES });
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
    } catch {
      // AES-256-GCM verifica el tag de autenticacion en decipher.final() —
      // un token cifrado con OTRA clave tiene el formato iv:tag:ciphertext
      // igual que uno valido (pasa el chequeo de arriba) y recien acá
      // revienta. Mismo hecho del mundo real que el caso legacy de arriba
      // ("este token no sirve"), pero nivel `error` en vez de `warn`: un
      // token legacy es historia; una clave que no corresponde significa
      // una rotacion en curso (esperada, transitoria) o datos cruzados
      // entre ambientes (nada esperado) — las dos merecen que alguien
      // mire. Sin este catch, decipher.final() tira y sube sin atrapar a
      // los cuatro llamadores de payments.service.ts como un 500 generico
      // — exactamente el "Ocurrio un error" que CLAUDE.md prohibe, y la
      // razon practica de que ENCRYPTION_KEY nunca se rote: rotarla hoy
      // tira la pasarela de pagos abajo.
      //
      // Limitacion conocida: decrypt() solo recibe el string cifrado, no
      // sabe de que paseador es — el log no puede nombrarlo. Darle ese
      // contexto exige cambiar la firma y tocar los cuatro call sites de
      // payments.service.ts; mas grande que este fix, decision de Joa.
      this.logger.error(
        "No se pudo desencriptar mpAccessToken: la clave no corresponde (ENCRYPTION_KEY rotada, " +
        "o el dato viene de otro ambiente). Se trata al paseador como NO CONECTADO — va a tener " +
        "que reconectar su cuenta de MercadoPago. El cobro se rechaza con el mensaje normal, no " +
        "con un 500.",
      );
      return "";
    }
  }
}
