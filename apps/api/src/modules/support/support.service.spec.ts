import { Test, TestingModule } from "@nestjs/testing";
import { Logger, NotFoundException } from "@nestjs/common";
import { SupportService } from "./support.service";
import { PrismaService } from "../../database/prisma.service";
import { startOfBusinessDay, endOfBusinessDay } from "../../common/utils/schedule-timezone";

const REQUESTING_USER = { id: "admin-1", role: "ADMIN" };

function buildPrismaMock() {
  return {
    walk: {
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
    },
    conversation: {
      findUnique: jest.fn(),
    },
    message: {
      findMany: jest.fn(),
      count: jest.fn(),
      updateMany: jest.fn(),
    },
  };
}

const SEARCH_ROW = {
  id: "walk-1",
  status: "CONFIRMED",
  scheduledAt: new Date("2026-09-10T15:00:00Z"),
  walkType: { label: "Paseo básico" },
  walker: { user: { firstName: "Juan" } },
  participants: [{ dog: { name: "Toto" }, owner: { user: { firstName: "Ana" } } }],
};

const CASE_ROW = {
  id: "walk-1",
  status: "CONFIRMED",
  mode: "GRUPAL",
  scheduledAt: new Date("2026-09-10T15:00:00Z"),
  createdAt: new Date("2026-09-01T10:00:00Z"),
  onWayAt: null,
  startedAt: null,
  endedAt: null,
  notPerformedAt: null,
  startedLate: false,
  endedLate: false,
  closedBy: null,
  notPerformedReason: null,
  startVerification: null,
  startVerifyReason: null,
  ownerAcknowledgedNoCodeAt: null,
  pickupCode: "1234",
  pickupCodeAttempts: 0,
  pickupAddress: "Av. Santa Fe 1234, Palermo",
  pickupLat: -34.5885,
  pickupLng: -58.4233,
  totalAmount: 3000,
  walkerAmount: 2420.91,
  cancellationReason: null,
  walkType: { label: "Paseo básico", durationMinutes: 45 },
  walker: {
    id: "wp-1",
    user: { id: "wu-1", firstName: "Juan", lastName: "Pérez", email: "juan@test.com", phone: "1111" },
  },
  participants: [
    {
      dog: { name: "Toto", size: "MEDIANO" },
      owner: {
        id: "op-1",
        user: { id: "ou-1", firstName: "Ana", lastName: "Gómez", email: "ana@test.com", phone: "2222" },
      },
    },
  ],
};

describe("SupportService", () => {
  let service: SupportService;
  let prisma: ReturnType<typeof buildPrismaMock>;

  beforeEach(async () => {
    prisma = buildPrismaMock();
    const module: TestingModule = await Test.createTestingModule({
      providers: [SupportService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get<SupportService>(SupportService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── searchWalks() ────────────────────────────────────────────────────────

  describe("searchWalks() — deny-by-default", () => {
    it("EL TEST MAS IMPORTANTE DEL BLOQUE: sin ningun filtro devuelve vacio y NO toca la base", async () => {
      const result = await service.searchWalks({});

      expect(result).toEqual({ data: [], meta: { total: 0, page: 1, limit: 20, totalPages: 0 } });
      expect(prisma.walk.findMany).not.toHaveBeenCalled();
      expect(prisma.walk.count).not.toHaveBeenCalled();
    });

    it("filtro idPrefix: arma el where con startsWith", async () => {
      prisma.walk.findMany.mockResolvedValue([SEARCH_ROW]);
      prisma.walk.count.mockResolvedValue(1);

      await service.searchWalks({ idPrefix: "a3f1b2c4" });

      const call = prisma.walk.findMany.mock.calls[0][0];
      expect(call.where).toEqual({ AND: [{ id: { startsWith: "a3f1b2c4" } }] });
    });

    it("filtro email: busca por OR en walker.user.email y participants.owner.user.email", async () => {
      prisma.walk.findMany.mockResolvedValue([SEARCH_ROW]);
      prisma.walk.count.mockResolvedValue(1);

      await service.searchWalks({ email: "juan@test.com" });

      const call = prisma.walk.findMany.mock.calls[0][0];
      expect(call.where).toEqual({
        AND: [
          {
            OR: [
              { walker: { user: { email: "juan@test.com" } } },
              { participants: { some: { owner: { user: { email: "juan@test.com" } } } } },
            ],
          },
        ],
      });
    });

    it("filtro desde/hasta: arma el rango sobre scheduledAt en DIAS DE CALENDARIO ART, no instantes UTC", async () => {
      prisma.walk.findMany.mockResolvedValue([SEARCH_ROW]);
      prisma.walk.count.mockResolvedValue(1);

      await service.searchWalks({ desde: "2026-09-01", hasta: "2026-09-30" });

      const call = prisma.walk.findMany.mock.calls[0][0];
      expect(call.where).toEqual({
        AND: [{
          scheduledAt: {
            gte: startOfBusinessDay("2026-09-01"),
            lte: endOfBusinessDay("2026-09-30"),
          },
        }],
      });
    });

    it("filtro desde = hasta (el mismo dia en los dos campos): NO es un rango vacio", async () => {
      prisma.walk.findMany.mockResolvedValue([SEARCH_ROW]);
      prisma.walk.count.mockResolvedValue(1);

      await service.searchWalks({ desde: "2026-09-10", hasta: "2026-09-10" });

      const call = prisma.walk.findMany.mock.calls[0][0];
      const { gte, lte } = call.where.AND[0].scheduledAt;
      expect(gte.getTime()).toBeLessThan(lte.getTime());
    });

    it("varios filtros a la vez se combinan con AND", async () => {
      prisma.walk.findMany.mockResolvedValue([]);
      prisma.walk.count.mockResolvedValue(0);

      await service.searchWalks({ idPrefix: "a3f1b2c4", email: "juan@test.com" });

      const call = prisma.walk.findMany.mock.calls[0][0];
      expect(call.where.AND).toHaveLength(2);
    });

    it("camino feliz: la fila del listado es lista blanca, no la fila entera de Walk", async () => {
      prisma.walk.findMany.mockResolvedValue([SEARCH_ROW]);
      prisma.walk.count.mockResolvedValue(1);

      const result = await service.searchWalks({ idPrefix: "a3f1b2c4" });

      expect(result.data).toEqual([
        {
          id: "walk-1",
          status: "CONFIRMED",
          scheduledAt: SEARCH_ROW.scheduledAt,
          walkType: { label: "Paseo básico" },
          walker: { firstName: "Juan" },
          owner: { firstName: "Ana" },
          dogs: [{ name: "Toto" }],
        },
      ]);
      // Ni rastro de un id de MercadoPago ni de nada parecido a un token
      // en la fila de listado.
      expect(result.data[0]).not.toHaveProperty("mpPaymentId");
      expect(result.data[0].walker).not.toHaveProperty("mpAccessToken");
    });

    it("respeta page/limit y calcula skip/take", async () => {
      prisma.walk.findMany.mockResolvedValue([]);
      prisma.walk.count.mockResolvedValue(0);

      await service.searchWalks({ idPrefix: "a3f1b2c4", page: 3, limit: 10 });

      const call = prisma.walk.findMany.mock.calls[0][0];
      expect(call.skip).toBe(20);
      expect(call.take).toBe(10);
    });
  });

  // ─── getCase() ────────────────────────────────────────────────────────────

  describe("getCase()", () => {
    it("lanza NotFoundException si el paseo no existe", async () => {
      prisma.walk.findUnique.mockResolvedValue(null);
      await expect(service.getCase("walk-inexistente")).rejects.toThrow(NotFoundException);
    });

    it("el caso completo NO lleva ids de MercadoPago, montos de plataforma, locations ni nada parecido a un token", async () => {
      prisma.walk.findUnique.mockResolvedValue(CASE_ROW);

      const result = await service.getCase("walk-1");

      // Ninguno de estos campos existe en la salida...
      expect(result).not.toHaveProperty("mpPaymentId");
      expect(result).not.toHaveProperty("mpRefundId");
      expect(result).not.toHaveProperty("refundedAt");
      expect(result).not.toHaveProperty("platformFee");
      expect(result).not.toHaveProperty("commissionRate");
      expect(result).not.toHaveProperty("locations");
      expect(result.walker).not.toHaveProperty("mpAccessToken");

      // ...y la garantia fuerte: el select que se le pide a Prisma tampoco
      // los pide. Si el dato nunca sale de Postgres, no hay forma de que
      // se escape.
      const select = prisma.walk.findUnique.mock.calls[0][0].select;
      expect(select).not.toHaveProperty("mpPaymentId");
      expect(select).not.toHaveProperty("mpRefundId");
      expect(select).not.toHaveProperty("refundedAt");
      expect(select).not.toHaveProperty("platformFee");
      expect(select).not.toHaveProperty("commissionRate");
      expect(select).not.toHaveProperty("locations");
      expect(select.walker.select).not.toHaveProperty("mpAccessToken");
      expect(select.walker.select.user.select).not.toHaveProperty("mpAccessToken");
    });

    it("camino feliz: trae los montos (totalAmount, walkerAmount) — eso si es legitimo para soporte", async () => {
      prisma.walk.findUnique.mockResolvedValue(CASE_ROW);
      const result = await service.getCase("walk-1");
      expect(result.totalAmount).toBe(3000);
      expect(result.walkerAmount).toBe(2420.91);
      expect(result.walker).toEqual({
        id: "wp-1", firstName: "Juan", lastName: "Pérez", email: "juan@test.com", phone: "1111",
      });
      expect(result.owner).toEqual({
        id: "op-1", firstName: "Ana", lastName: "Gómez", email: "ana@test.com", phone: "2222",
      });
      expect(result.dogs).toEqual([{ name: "Toto", size: "MEDIANO" }]);
    });
  });

  // ─── getMessages() ────────────────────────────────────────────────────────

  describe("getMessages() — estrictamente de lectura", () => {
    it("NO llama a message.update ni message.updateMany — no altera isRead", async () => {
      prisma.conversation.findUnique.mockResolvedValue({ id: "conv-1" });
      prisma.message.findMany.mockResolvedValue([]);
      prisma.message.count.mockResolvedValue(0);

      await service.getMessages("walk-1", {}, REQUESTING_USER);

      expect(prisma.message.updateMany).not.toHaveBeenCalled();
    });

    it("entra por walkId (Conversation.walkId, no conversationId)", async () => {
      prisma.conversation.findUnique.mockResolvedValue({ id: "conv-1" });
      prisma.message.findMany.mockResolvedValue([]);
      prisma.message.count.mockResolvedValue(0);

      await service.getMessages("walk-1", {}, REQUESTING_USER);

      expect(prisma.conversation.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { walkId: "walk-1" } }),
      );
    });

    it("un paseo sin conversacion devuelve [] — NO 404", async () => {
      prisma.conversation.findUnique.mockResolvedValue(null);

      const result = await service.getMessages("walk-sin-chat", {}, REQUESTING_USER);

      expect(result).toEqual({
        data: [],
        meta: { total: 0, page: 1, limit: 50, totalPages: 0, conversationExists: false },
      });
      expect(prisma.message.findMany).not.toHaveBeenCalled();
    });

    // El bug que esto corrige (testeo en staging, 2026-09-11): "no hay
    // conversacion" (nunca se confirmo el paseo) y "la conversacion existe
    // pero nadie escribio" daban las dos data: [] — el front no las podia
    // distinguir, y en una disputa "no te escribi porque no podia" se cae si
    // el canal SI estaba disponible. conversationExists distingue los dos
    // hechos; el conversationId NUNCA se expone, no hace falta para esto.
    it("una conversacion que EXISTE pero no tiene mensajes: conversationExists true, distinto de 'no hay conversacion'", async () => {
      prisma.conversation.findUnique.mockResolvedValue({ id: "conv-1" });
      prisma.message.findMany.mockResolvedValue([]);
      prisma.message.count.mockResolvedValue(0);

      const result = await service.getMessages("walk-1", {}, REQUESTING_USER);

      expect(result).toEqual({
        data: [],
        meta: { total: 0, page: 1, limit: 50, totalPages: 0, conversationExists: true },
      });
      // conversation.id (interno) no aparece en ningun lado de la salida.
      expect(JSON.stringify(result)).not.toContain("conv-1");
    });

    it("camino feliz: devuelve id, content, createdAt, containsContactInfo, isRead y el sender con apellido y rol", async () => {
      prisma.conversation.findUnique.mockResolvedValue({ id: "conv-1" });
      const MESSAGE = {
        id: "msg-1",
        content: "hola",
        createdAt: new Date("2026-09-09T01:00:00Z"),
        containsContactInfo: true,
        isRead: false,
        sender: { id: "u-1", firstName: "Juan", lastName: "Pérez", role: "WALKER" },
      };
      prisma.message.findMany.mockResolvedValue([MESSAGE]);
      prisma.message.count.mockResolvedValue(1);

      const result = await service.getMessages("walk-1", {}, REQUESTING_USER);

      expect(result.data).toEqual([MESSAGE]);
      expect(result.meta.conversationExists).toBe(true);
    });

    it("respeta page/limit con default 50", async () => {
      prisma.conversation.findUnique.mockResolvedValue({ id: "conv-1" });
      prisma.message.findMany.mockResolvedValue([]);
      prisma.message.count.mockResolvedValue(0);

      await service.getMessages("walk-1", { page: 2, limit: 10 }, REQUESTING_USER);

      const call = prisma.message.findMany.mock.calls[0][0];
      expect(call.skip).toBe(10);
      expect(call.take).toBe(10);
    });
  });

  // ─── El log de acceso — solo en messages ───────────────────────────────────

  describe("log de acceso: solo en getMessages(), nunca en los otros dos", () => {
    // toSupportWalkRow()/toSupportWalk() son funciones de módulo, no de la
    // clase — no hay this.logger que espiar. Se espía Logger.prototype:
    // intercepta la llamada sin importar qué instancia de Logger la hizo,
    // que es exactamente lo que hace falta acá.
    it("getMessages() emite el log con usuario, rol y walkId", async () => {
      const logSpy = jest.spyOn(Logger.prototype, "log");
      prisma.conversation.findUnique.mockResolvedValue({ id: "conv-1" });
      prisma.message.findMany.mockResolvedValue([]);
      prisma.message.count.mockResolvedValue(0);

      await service.getMessages("walk-1", {}, REQUESTING_USER);

      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining("usuario admin-1 (ADMIN) leyo el chat del paseo walk-1"),
      );
    });

    it("searchWalks() NO emite el log de acceso al chat", async () => {
      // Se filtra por contenido, no por "cero llamadas": Logger.prototype es
      // compartido con el logging interno de Nest (ej. "RootTestModule
      // dependencies initialized" al compilar el TestingModule), que no
      // tiene nada que ver con esto.
      const logSpy = jest.spyOn(Logger.prototype, "log");
      prisma.walk.findMany.mockResolvedValue([]);
      prisma.walk.count.mockResolvedValue(0);

      await service.searchWalks({ idPrefix: "a3f1b2c4" });

      expect(logSpy).not.toHaveBeenCalledWith(expect.stringContaining("leyo el chat"));
    });

    it("getCase() NO emite el log de acceso al chat", async () => {
      const logSpy = jest.spyOn(Logger.prototype, "log");
      prisma.walk.findUnique.mockResolvedValue(CASE_ROW);

      await service.getCase("walk-1");

      expect(logSpy).not.toHaveBeenCalledWith(expect.stringContaining("leyo el chat"));
    });

    // El bug que esto corrige: el log vivia DESPUES del return temprano de
    // "no hay conversacion", asi que nunca se emitia en ese caso — hacia
    // imposible distinguir "nunca intento abrir el chat" de "lo abrio y
    // estaba vacio". Se registra el ACCESO (que alguien pidio), no lo
    // LEIDO (que habia para leer) — son dos cosas distintas.
    it("getMessages() emite el log TAMBIEN cuando el paseo no tiene conversacion", async () => {
      const logSpy = jest.spyOn(Logger.prototype, "log");
      prisma.conversation.findUnique.mockResolvedValue(null);

      await service.getMessages("walk-sin-chat", {}, REQUESTING_USER);

      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining("usuario admin-1 (ADMIN) leyo el chat del paseo walk-sin-chat"),
      );
    });
  });

  // ─── Invariante roto: paseo sin participantes ──────────────────────────────
  // "Un paseo tiene un único dueño" — si participants viene vacío es un dato
  // corrupto, no un caso válido. La pantalla tiene que poder abrirse igual
  // (owner: null, nunca un 500: esta pantalla es la que alguien usa para
  // investigar justamente un dato roto) pero el sistema no puede quedarse
  // callado sobre algo imposible.

  describe("invariante roto: paseo sin participantes", () => {
    const SEARCH_ROW_SIN_PARTICIPANTES = { ...SEARCH_ROW, participants: [] };
    const CASE_ROW_SIN_PARTICIPANTES = { ...CASE_ROW, participants: [] };

    it("searchWalks(): NO tira, owner queda null", async () => {
      prisma.walk.findMany.mockResolvedValue([SEARCH_ROW_SIN_PARTICIPANTES]);
      prisma.walk.count.mockResolvedValue(1);

      const result = await service.searchWalks({ idPrefix: "a3f1b2c4" });

      expect(result.data[0].owner).toBeNull();
      expect(result.data[0].dogs).toEqual([]);
    });

    it("searchWalks(): emite el error del invariante roto, nivel error", async () => {
      const errorSpy = jest.spyOn(Logger.prototype, "error");
      prisma.walk.findMany.mockResolvedValue([SEARCH_ROW_SIN_PARTICIPANTES]);
      prisma.walk.count.mockResolvedValue(1);

      await service.searchWalks({ idPrefix: "a3f1b2c4" });

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Paseo walk-1 sin participantes'),
      );
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('un paseo, un dueño'),
      );
    });

    it("getCase(): NO tira, owner queda null", async () => {
      prisma.walk.findUnique.mockResolvedValue(CASE_ROW_SIN_PARTICIPANTES);

      const result = await service.getCase("walk-1");

      expect(result.owner).toBeNull();
      expect(result.dogs).toEqual([]);
    });

    it("getCase(): emite el error del invariante roto, nivel error", async () => {
      const errorSpy = jest.spyOn(Logger.prototype, "error");
      prisma.walk.findUnique.mockResolvedValue(CASE_ROW_SIN_PARTICIPANTES);

      await service.getCase("walk-1");

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Paseo walk-1 sin participantes'),
      );
    });

    it("el caso normal (con participantes) NO emite el error del invariante", async () => {
      const errorSpy = jest.spyOn(Logger.prototype, "error");

      prisma.walk.findMany.mockResolvedValue([SEARCH_ROW]);
      prisma.walk.count.mockResolvedValue(1);
      await service.searchWalks({ idPrefix: "a3f1b2c4" });

      prisma.walk.findUnique.mockResolvedValue(CASE_ROW);
      await service.getCase("walk-1");

      expect(errorSpy).not.toHaveBeenCalledWith(expect.stringContaining("sin participantes"));
    });
  });
});
