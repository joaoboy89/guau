import { Test, TestingModule } from '@nestjs/testing';
import { UserRole } from '@prisma/client';
import { ChatService } from './chat.service';
import { PrismaService } from '../../database/prisma.service';
import { TrackingGateway } from '../tracking/tracking.gateway';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const CONVERSATION_ID = 'conv-1';
const OWNER_USER_ID    = 'owner-user-1';
const WALKER_USER_ID   = 'walker-user-1';
const OWNER_PROFILE_ID  = 'op-1';
const WALKER_PROFILE_ID = 'wp-1';

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
        ownerId: OWNER_PROFILE_ID,
        walkerId: WALKER_PROFILE_ID,
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
      prisma.conversation.findUnique.mockResolvedValue({
        ownerId: OWNER_PROFILE_ID,
        walkerId: WALKER_PROFILE_ID,
      });
      prisma.message.findMany.mockResolvedValue([]);

      await service.getMessages(OWNER_USER_ID, UserRole.OWNER, CONVERSATION_ID);

      expect(prisma.message.findMany.mock.calls[0][0].take).toBe(200);
    });
  });
});
