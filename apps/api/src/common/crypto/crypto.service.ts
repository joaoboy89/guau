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
    const decipher = crypto.createDecipheriv(ALGO, this.key, iv, { authTagLength: TAG_BYTES });
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  }
}
