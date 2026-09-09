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

  // decrypt() nunca tira — un fallo de autenticacion GCM (authTag alterado,
  // o cifrado con OTRA clave: el mismo mecanismo) degrada a "no conectado",
  // no a una excepcion que suba como 500 a los cuatro llamadores de
  // payments.service.ts. Antes de este fix, este mismo caso SÍ tiraba.
  it("decrypt con authTag alterado NO tira: degrada a string vacío", () => {
    const encrypted = service.encrypt("my-secret-token");
    const [iv, tag, ciphertext] = encrypted.split(":");
    const tamperedBuf = Buffer.from(tag, "hex");
    tamperedBuf[0] ^= 0xff;
    const badTag = tamperedBuf.toString("hex");
    expect(() => service.decrypt(`${iv}:${badTag}:${ciphertext}`)).not.toThrow();
    expect(service.decrypt(`${iv}:${badTag}:${ciphertext}`)).toBe("");
  });

  it("decrypt con un payload cifrado con OTRA clave: NO tira, degrada a string vacío", () => {
    const OTRA_KEY = "f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6".slice(0, 64);
    const original = process.env.ENCRYPTION_KEY;
    process.env.ENCRYPTION_KEY = OTRA_KEY;
    const otroService = new CryptoService();
    process.env.ENCRYPTION_KEY = original;

    const encriptadoConOtraClave = otroService.encrypt("token-de-otro-ambiente");

    expect(() => service.decrypt(encriptadoConOtraClave)).not.toThrow();
    expect(service.decrypt(encriptadoConOtraClave)).toBe("");
  });

  it("decrypt defensivo: token sin formato cifrado retorna string vacío", () => {
    const legacy = "APP_USR-legacy-plaintext-without-colons";
    expect(service.decrypt(legacy)).toBe("");
  });

  // Un token legacy y una clave que no corresponde son el mismo sintoma
  // ("este token no sirve") por causas distintas — el log tiene que poder
  // distinguirlos. Mismo criterio que "nunca un else que se coma todo"
  // aplicado al logging, no solo a las respuestas HTTP.
  describe("distincion entre token legacy y clave que no corresponde", () => {
    it("token legacy: warn, con 'legacy' en el mensaje", () => {
      const warnSpy = jest.spyOn((service as unknown as { logger: { warn: (m: string) => void } }).logger, "warn");
      service.decrypt("APP_USR-legacy-plaintext-without-colons");
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("legacy"));
    });

    it("clave que no corresponde: error (no warn), con 'clave' en el mensaje — nivel distinto del legacy", () => {
      const errorSpy = jest.spyOn((service as unknown as { logger: { error: (m: string) => void } }).logger, "error");
      const warnSpy = jest.spyOn((service as unknown as { logger: { warn: (m: string) => void } }).logger, "warn");
      const encrypted = service.encrypt("my-secret-token");
      const [iv, tag, ciphertext] = encrypted.split(":");
      const tamperedBuf = Buffer.from(tag, "hex");
      tamperedBuf[0] ^= 0xff;
      const badTag = tamperedBuf.toString("hex");

      service.decrypt(`${iv}:${badTag}:${ciphertext}`);

      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("clave"));
      expect(warnSpy).not.toHaveBeenCalled();
    });
  });

  it("constructor lanza si ENCRYPTION_KEY no es un string hex de 64 caracteres", () => {
    const original = process.env.ENCRYPTION_KEY;
    process.env.ENCRYPTION_KEY = "demasiado-corto";
    expect(() => new CryptoService()).toThrow(/ENCRYPTION_KEY/);
    process.env.ENCRYPTION_KEY = original;
  });
});
