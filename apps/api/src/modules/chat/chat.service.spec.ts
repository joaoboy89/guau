import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { UserRole, WalkStatus } from '@prisma/client';
import { ChatService } from './chat.service';
import { PrismaService } from '../../database/prisma.service';
import { TrackingGateway } from '../tracking/tracking.gateway';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const CONVERSATION_ID = 'conv-1';
const OWNER_USER_ID    = 'owner-user-1';
const WALKER_USER_ID   = 'walker-user-1';
const ADMIN_USER_ID    = 'admin-user-1';
const OWNER_PROFILE_ID  = 'op-1';
const WALKER_PROFILE_ID = 'wp-1';

function conversationRow(status: WalkStatus | null) {
  return {
    ownerId: OWNER_PROFILE_ID,
    walkerId: WALKER_PROFILE_ID,
    walk: status === null ? null : { status },
  };
}

function buildPrismaMock() {
  return {
    conversation: { findUnique: jest.fn(), findMany: jest.fn(), upsert: jest.fn() },
    message:      { findMany: jest.fn(), updateMany: jest.fn(), create: jest.fn() },
    walkerProfile: { findUnique: jest.fn() },
    ownerProfile:  { findUnique: jest.fn() },
    walk:          { findUnique: jest.fn() },
  };
}

describe('ChatService', () => {
  let service: ChatService;
  let prisma:  ReturnType<typeof buildPrismaMock>;
  let trackingGateway: { emitMessage: jest.Mock };

  beforeEach(async () => {
    prisma = buildPrismaMock();
    trackingGateway = { emitMessage: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatService,
        { provide: PrismaService,   useValue: prisma },
        { provide: TrackingGateway, useValue: trackingGateway },
      ],
    }).compile();

    service = module.get<ChatService>(ChatService);
    prisma.walkerProfile.findUnique.mockResolvedValue({ id: WALKER_PROFILE_ID, userId: WALKER_USER_ID });
    prisma.ownerProfile.findUnique.mockResolvedValue({ id: OWNER_PROFILE_ID, userId: OWNER_USER_ID });
  });

  afterEach(() => jest.clearAllMocks());

  // ─── La fuga de la dirección exacta del dueño (1.1) ──────────────────────
  // Un include sobre owner/walker trae TODOS los campos escalares del
  // profile — OwnerProfile tiene address/neighborhood/lat/lng. Estos tests
  // verifican el CONTRATO de la consulta (el select exacto), no solo la
  // forma de la respuesta: un mock siempre "responde bien" sin importar qué
  // where/select se le pasó, así que si no se mira la llamada en sí, un
  // include que vuelva a colarse pasaría sin que ningún test lo note.

  describe('conversationInclude() — getMyConversations() nunca pide OwnerProfile completo', () => {
    it('el include de owner y walker es select explícito, sin address/neighborhood/lat/lng ni apellido', async () => {
      prisma.conversation.findMany.mockResolvedValue([]);

      await service.getMyConversations(OWNER_USER_ID, UserRole.OWNER);

      const call = prisma.conversation.findMany.mock.calls[0][0];
      expect(call.include.owner).toEqual({
        select: { id: true, user: { select: { firstName: true, avatarUrl: true } } },
      });
      expect(call.include.walker).toEqual({
        select: { id: true, user: { select: { firstName: true, avatarUrl: true } } },
      });
      // Ni "include" en ninguno de los dos, ni un solo campo de domicilio.
      expect(JSON.stringify(call.include.owner)).not.toMatch(/address|neighborhood|lat|lng|lastName|include/i);
      expect(JSON.stringify(call.include.walker)).not.toMatch(/address|neighborhood|lat|lng|lastName|include/i);
    });
  });

  describe('sendMessage() — select mínimo para determinar el destinatario', () => {
    it('el select de owner/walker no trae domicilio ni nombre completo, solo el id del User', async () => {
      prisma.conversation.findUnique.mockResolvedValue({
        ...conversationRow(WalkStatus.CONFIRMED),
        owner:  { user: { id: OWNER_USER_ID } },
        walker: { user: { id: WALKER_USER_ID } },
      });
      prisma.message.create.mockResolvedValue({ id: 'msg-1' });

      await service.sendMessage(OWNER_USER_ID, UserRole.OWNER, CONVERSATION_ID, { content: 'hola' });

      const select = prisma.conversation.findUnique.mock.calls[0][0].select;
      expect(select.owner).toEqual({ select: { user: { select: { id: true } } } });
      expect(select.walker).toEqual({ select: { user: { select: { id: true } } } });
    });
  });

  // ─── Las dos listas sin techo (1.2) ──────────────────────────────────────

  describe('getMyConversations() — take: 50 (backstop)', () => {
    it('lleva take: 50', async () => {
      prisma.conversation.findMany.mockResolvedValue([]);
      await service.getMyConversations(OWNER_USER_ID, UserRole.OWNER);
      expect(prisma.conversation.findMany.mock.calls[0][0].take).toBe(50);
    });

    it('lleva take: 50 también del lado paseador', async () => {
      prisma.conversation.findMany.mockResolvedValue([]);
      await service.getMyConversations(WALKER_USER_ID, UserRole.WALKER);
      expect(prisma.conversation.findMany.mock.calls[0][0].take).toBe(50);
    });
  });

  describe('getMessages() — take: 200 (backstop)', () => {
    it('lleva take: 200', async () => {
      prisma.conversation.findUnique.mockResolvedValue(conversationRow(WalkStatus.CONFIRMED));
      prisma.message.findMany.mockResolvedValue([]);

      await service.getMessages(OWNER_USER_ID, UserRole.OWNER, CONVERSATION_ID);

      expect(prisma.message.findMany.mock.calls[0][0].take).toBe(200);
    });
  });

  // ─── El acceso depende del estado del paseo, no solo de quién sos (1.3) ──

  describe('acceso a getMessages() / sendMessage() según el estado del paseo', () => {
    it('parte del lado dueño + paseo abierto (CONFIRMED) → accede', async () => {
      prisma.conversation.findUnique.mockResolvedValue(conversationRow(WalkStatus.CONFIRMED));
      prisma.message.findMany.mockResolvedValue([]);

      await expect(
        service.getMessages(OWNER_USER_ID, UserRole.OWNER, CONVERSATION_ID),
      ).resolves.toEqual([]);
    });

    it('parte del lado paseador + paseo abierto (WALKER_ON_WAY) → accede', async () => {
      prisma.conversation.findUnique.mockResolvedValue(conversationRow(WalkStatus.WALKER_ON_WAY));
      prisma.message.findMany.mockResolvedValue([]);

      await expect(
        service.getMessages(WALKER_USER_ID, UserRole.WALKER, CONVERSATION_ID),
      ).resolves.toEqual([]);
    });

    it.each([
      WalkStatus.COMPLETED,
      WalkStatus.CANCELLED_OWNER,
      WalkStatus.CANCELLED_WALKER,
      WalkStatus.NOT_PERFORMED,
    ])('parte + paseo cerrado (%s) → 403, aunque sea dueño/paseador real', async (status) => {
      prisma.conversation.findUnique.mockResolvedValue(conversationRow(status));

      await expect(
        service.getMessages(OWNER_USER_ID, UserRole.OWNER, CONVERSATION_ID),
      ).rejects.toThrow(ForbiddenException);
    });

    it('admin + paseo cerrado (COMPLETED) → accede igual', async () => {
      prisma.conversation.findUnique.mockResolvedValue(conversationRow(WalkStatus.COMPLETED));
      prisma.message.findMany.mockResolvedValue([]);

      await expect(
        service.getMessages(ADMIN_USER_ID, UserRole.ADMIN, CONVERSATION_ID),
      ).resolves.toEqual([]);
      // El admin no pasa por ninguno de los dos perfiles — no es dueño ni paseador de nada.
      expect(prisma.ownerProfile.findUnique).not.toHaveBeenCalled();
      expect(prisma.walkerProfile.findUnique).not.toHaveBeenCalled();
    });

    it('admin + paseo abierto → accede igual', async () => {
      prisma.conversation.findUnique.mockResolvedValue(conversationRow(WalkStatus.IN_PROGRESS));
      prisma.message.findMany.mockResolvedValue([]);

      await expect(
        service.getMessages(ADMIN_USER_ID, UserRole.ADMIN, CONVERSATION_ID),
      ).resolves.toEqual([]);
    });

    it('conversación sin paseo asociado (walkId null) → falla cerrado, 403 aunque sea parte', async () => {
      prisma.conversation.findUnique.mockResolvedValue(conversationRow(null));

      await expect(
        service.getMessages(OWNER_USER_ID, UserRole.OWNER, CONVERSATION_ID),
      ).rejects.toThrow(ForbiddenException);
    });

    it('quien no es parte de la conversación → 403, sin llegar a mirar el estado del paseo', async () => {
      prisma.conversation.findUnique.mockResolvedValue(conversationRow(WalkStatus.CONFIRMED));
      prisma.ownerProfile.findUnique.mockResolvedValue({ id: 'otro-owner', userId: OWNER_USER_ID });

      await expect(
        service.getMessages(OWNER_USER_ID, UserRole.OWNER, CONVERSATION_ID),
      ).rejects.toThrow(ForbiddenException);
    });

    it('conversación inexistente → 404, no 403', async () => {
      prisma.conversation.findUnique.mockResolvedValue(null);

      await expect(
        service.getMessages(OWNER_USER_ID, UserRole.OWNER, CONVERSATION_ID),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getMyConversations() — filtra paseos cerrados (1.3, "no ven")', () => {
    it('el where lleva walk.status.notIn con los cuatro estados cerrados', async () => {
      prisma.conversation.findMany.mockResolvedValue([]);
      await service.getMyConversations(WALKER_USER_ID, UserRole.WALKER);

      const where = prisma.conversation.findMany.mock.calls[0][0].where;
      expect(where.walk.status.notIn).toEqual(
        expect.arrayContaining([
          WalkStatus.COMPLETED, WalkStatus.CANCELLED_OWNER,
          WalkStatus.CANCELLED_WALKER, WalkStatus.NOT_PERFORMED,
        ]),
      );
    });
  });
});
