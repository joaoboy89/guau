import { Test } from "@nestjs/testing";
import { CryptoService } from "./crypto.service";

const VALID_KEY = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2";

describe("CryptoService", () => {
  let service: CryptoService;

  beforeAll(() => {
    process.env.ENCRYPTION_KEY = VALID_KEY;
  });

  afterAll(() => {
    delete process.env.ENCRYPTION_KEY;
  });

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [CryptoService],
    }).compile();
    service = module.get<CryptoService>(CryptoService);
  });

  it("roundtrip: decrypt(encrypt(x)) === x", () => {
    const original = "APP_USR-12345678-mocktoken-walker";
    expect(service.decrypt(service.encrypt(original))).toBe(original);
  });

  it("encrypt produce formato iv:tag:ciphertext en hex", () => {
    const encrypted = service.encrypt("test-value");
    const parts = encrypted.split(":");
    expect(parts).toHaveLength(3);
    expect(parts[0]).toMatch(/^[0-9a-f]{24}$/); // 12 bytes → 24 hex chars
    expect(parts[1]).toMatch(/^[0-9a-f]{32}$/); // 16 bytes → 32 hex chars
    expect(parts[2]).toMatch(/^[0-9a-f]+$/);
  });

  it("dos encrypt del mismo valor producen resultados distintos (IV aleatorio)", () => {
    const a = service.encrypt("same-token");
    const b = service.encrypt("same-token");
    expect(a).not.toBe(b);
  });

  it("decrypt con authTag alterado lanza error (GCM integrity check)", () => {
    const encrypted = service.encrypt("my-secret-token");
    const [iv, tag, ciphertext] = encrypted.split(":");
    const tamperedBuf = Buffer.from(tag, "hex");
    tamperedBuf[0] ^= 0xff;
    const badTag = tamperedBuf.toString("hex");
    expect(() => service.decrypt(`${iv}:${badTag}:${ciphertext}`)).toThrow();
  });

  it("decrypt defensivo: token sin formato cifrado retorna string vacío", () => {
    const legacy = "APP_USR-legacy-plaintext-without-colons";
    expect(service.decrypt(legacy)).toBe("");
  });

  it("constructor lanza si ENCRYPTION_KEY no es un string hex de 64 caracteres", () => {
    const original = process.env.ENCRYPTION_KEY;
    process.env.ENCRYPTION_KEY = "demasiado-corto";
    expect(() => new CryptoService()).toThrow(/ENCRYPTION_KEY/);
    process.env.ENCRYPTION_KEY = original;
  });
});
