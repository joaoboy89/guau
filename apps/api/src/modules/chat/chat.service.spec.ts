import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { UserRole, WalkStatus } from '@prisma/client';
import { NOTIFICATION_TYPES } from '@guau/shared';
import { ChatService } from './chat.service';
import { PrismaService } from '../../database/prisma.service';
import { TrackingGateway } from '../tracking/tracking.gateway';
import { NotificationsService } from '../notifications/notifications.service';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const CONVERSATION_ID = 'conv-1';
const OWNER_USER_ID    = 'owner-user-1';
const WALKER_USER_ID   = 'walker-user-1';
const ADMIN_USER_ID    = 'admin-user-1';
const OWNER_PROFILE_ID  = 'op-1';
const WALKER_PROFILE_ID = 'wp-1';
const SENDER_FIRST_NAME = 'Ana';

// El mensaje creado SIEMPRE trae sender (message.create() lo incluye en el
// select real) — estos mocks reflejan esa forma, no la achican, porque
// sendMessage() ahora lee message.sender.firstName para el título de la
// notificación.
const MESSAGE_ROW = { id: 'msg-1', sender: { firstName: SENDER_FIRST_NAME } };

function conversationRow(status: WalkStatus | null, walkId: string | null = null) {
  return {
    ownerId: OWNER_PROFILE_ID,
    walkerId: WALKER_PROFILE_ID,
    walkId,
    walk: status === null ? null : { status },
  };
}

// Fire-and-forget (notifyNewMessage() adentro de sendMessage()): el .catch()
// se encadena en el momento, pero la cadena real (chequeo de duplicado +
// create) sigue corriendo en microtasks posteriores al return de
// sendMessage(). Mismo criterio que mail.service.spec.ts para testear un
// .send() fire-and-forget — deja correr la cola de microtasks antes de
// afirmar sobre el mock.
function flushPromises() {
  return new Promise((resolve) => setImmediate(resolve));
}

function buildPrismaMock() {
  return {
    conversation: { findUnique: jest.fn(), findMany: jest.fn(), upsert: jest.fn() },
    message:      { findMany: jest.fn(), updateMany: jest.fn(), create: jest.fn() },
    walkerProfile: { findUnique: jest.fn() },
    ownerProfile:  { findUnique: jest.fn() },
    walk:          { findUnique: jest.fn() },
    notification:  { findMany: jest.fn() },
  };
}

describe('ChatService', () => {
  let service: ChatService;
  let prisma:  ReturnType<typeof buildPrismaMock>;
  let trackingGateway: { emitMessage: jest.Mock };
  let notificationsService: { create: jest.Mock };

  beforeEach(async () => {
    prisma = buildPrismaMock();
    trackingGateway = { emitMessage: jest.fn() };
    notificationsService = { create: jest.fn().mockResolvedValue({}) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatService,
        { provide: PrismaService,   useValue: prisma },
        { provide: TrackingGateway, useValue: trackingGateway },
        { provide: NotificationsService, useValue: notificationsService },
      ],
    }).compile();

    service = module.get<ChatService>(ChatService);
    prisma.walkerProfile.findUnique.mockResolvedValue({ id: WALKER_PROFILE_ID, userId: WALKER_USER_ID });
    prisma.ownerProfile.findUnique.mockResolvedValue({ id: OWNER_PROFILE_ID, userId: OWNER_USER_ID });
    // Default: sin notificaciones de chat sin leer — cada test que quiera
    // simular lo contrario lo pisa explícitamente.
    prisma.notification.findMany.mockResolvedValue([]);
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
      prisma.message.create.mockResolvedValue(MESSAGE_ROW);

      await service.sendMessage(OWNER_USER_ID, UserRole.OWNER, CONVERSATION_ID, { content: 'hola' });

      const select = prisma.conversation.findUnique.mock.calls[0][0].select;
      expect(select.owner).toEqual({ select: { user: { select: { id: true } } } });
      expect(select.walker).toEqual({ select: { user: { select: { id: true } } } });
    });
  });

  // ─── El apellido es un dato de Güau, no de las partes ────────────────────
  // Un dueño y un paseador no se ven el apellido en ninguna pantalla —
  // regla de Joa. La cabecera de la conversación ya lo cumplía (1.1); acá
  // el sender de cada mensaje individual también tenía lastName.

  describe('el sender de un mensaje nunca lleva apellido', () => {
    it('getMessages() no pide lastName en el select de sender', async () => {
      prisma.conversation.findUnique.mockResolvedValue(conversationRow(WalkStatus.CONFIRMED));
      prisma.message.findMany.mockResolvedValue([]);

      await service.getMessages(OWNER_USER_ID, UserRole.OWNER, CONVERSATION_ID);

      const select = prisma.message.findMany.mock.calls[0][0].include.sender.select;
      expect(select).toEqual({ id: true, firstName: true, avatarUrl: true });
      expect(select.lastName).toBeUndefined();
    });

    it('sendMessage() no pide lastName en el select de sender del mensaje creado', async () => {
      prisma.conversation.findUnique.mockResolvedValue({
        ...conversationRow(WalkStatus.CONFIRMED),
        owner:  { user: { id: OWNER_USER_ID } },
        walker: { user: { id: WALKER_USER_ID } },
      });
      prisma.message.create.mockResolvedValue(MESSAGE_ROW);

      await service.sendMessage(OWNER_USER_ID, UserRole.OWNER, CONVERSATION_ID, { content: 'hola' });

      const select = prisma.message.create.mock.calls[0][0].include.sender.select;
      expect(select).toEqual({ id: true, firstName: true, avatarUrl: true });
      expect(select.lastName).toBeUndefined();
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

  // ─── El detector de contacto, ya cableado en sendMessage() (1.4) ─────────
  // Los casos del detector en sí (los dos ejemplos textuales, guiones,
  // puntos, mail, @handle) están en contact-detector.spec.ts, contra las
  // funciones puras — acá solo se prueba que sendMessage() las use bien.

  describe('sendMessage() — detector de contacto (dos niveles)', () => {
    function setupSendMessage() {
      prisma.conversation.findUnique.mockResolvedValue({
        ...conversationRow(WalkStatus.CONFIRMED),
        owner:  { user: { id: OWNER_USER_ID } },
        walker: { user: { id: WALKER_USER_ID } },
      });
    }

    it('nivel 1 (teléfono ofuscado): 400, NO crea el mensaje, NO emite por socket', async () => {
      setupSendMessage();

      await expect(
        service.sendMessage(OWNER_USER_ID, UserRole.OWNER, CONVERSATION_ID, {
          content: 'hablame 11 53 6 26 9 85',
        }),
      ).rejects.toThrow(BadRequestException);

      expect(prisma.message.create).not.toHaveBeenCalled();
      expect(trackingGateway.emitMessage).not.toHaveBeenCalled();
    });

    it('el 400 de nivel 1 no delata qué patrón saltó (no menciona "10" ni "dígitos")', async () => {
      setupSendMessage();
      let message: string | undefined;
      try {
        await service.sendMessage(OWNER_USER_ID, UserRole.OWNER, CONVERSATION_ID, {
          content: 'hablame 11 53 6 26 9 85',
        });
      } catch (e) {
        message = (e as BadRequestException).message;
      }
      expect(message).toBeDefined();
      expect(message).not.toMatch(/10|11|dígito|digit/i);
    });

    it('nivel 2 ("no tengo WhatsApp"): NO bloquea, crea el mensaje con containsContactInfo true', async () => {
      setupSendMessage();
      prisma.message.create.mockResolvedValue(MESSAGE_ROW);

      await service.sendMessage(OWNER_USER_ID, UserRole.OWNER, CONVERSATION_ID, {
        content: 'Te escribo por aca porque no tengo WhatsApp',
      });

      expect(prisma.message.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ containsContactInfo: true }),
        }),
      );
    });

    it('mensaje sin dato ni mención: crea con containsContactInfo false', async () => {
      setupSendMessage();
      prisma.message.create.mockResolvedValue(MESSAGE_ROW);

      await service.sendMessage(OWNER_USER_ID, UserRole.OWNER, CONVERSATION_ID, {
        content: 'Dale, nos vemos mañana en la puerta del edificio',
      });

      expect(prisma.message.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ containsContactInfo: false }),
        }),
      );
    });

    it('el bloqueo por estado cerrado corta ANTES que el detector de contacto', async () => {
      prisma.conversation.findUnique.mockResolvedValue({
        ...conversationRow(WalkStatus.COMPLETED),
        owner:  { user: { id: OWNER_USER_ID } },
        walker: { user: { id: WALKER_USER_ID } },
      });

      await expect(
        service.sendMessage(OWNER_USER_ID, UserRole.OWNER, CONVERSATION_ID, {
          content: 'hola, mensaje inocente',
        }),
      ).rejects.toThrow(ForbiddenException);

      expect(prisma.message.create).not.toHaveBeenCalled();
    });
  });

  // ─── Notificación persistente del mensaje — una por conversación ────────
  // chat.service.ts nunca creaba una fila en Notification: un mensaje solo
  // se emitía por socket, así que si el destinatario no tenía abierta ESA
  // pantalla exacta del chat, no se enteraba nunca. Decisión de producto
  // (Joa): UNA notificación por conversación mientras no esté leída, no una
  // por mensaje (ver el comentario de CHAT_MESSAGE en
  // packages/shared/constants/index.ts) — por eso el chequeo de duplicado
  // es la mitad de esta batería de tests, no solo "se crea la notificación".

  describe('sendMessage() — notificación persistente del mensaje', () => {
    function setupSendMessage(walkId: string | null = 'walk-1') {
      prisma.conversation.findUnique.mockResolvedValue({
        ...conversationRow(WalkStatus.CONFIRMED, walkId),
        owner:  { user: { id: OWNER_USER_ID } },
        walker: { user: { id: WALKER_USER_ID } },
      });
      prisma.message.create.mockResolvedValue(MESSAGE_ROW);
    }

    it('primer mensaje de una conversación: crea la notificación para el destinatario', async () => {
      setupSendMessage('walk-1');

      await service.sendMessage(OWNER_USER_ID, UserRole.OWNER, CONVERSATION_ID, { content: 'hola' });
      await flushPromises();

      expect(notificationsService.create).toHaveBeenCalledWith({
        userId: WALKER_USER_ID,
        title: `${SENDER_FIRST_NAME} te mandó un mensaje`,
        body:  'Abrí el chat del paseo para responderle.',
        type:  NOTIFICATION_TYPES.CHAT_MESSAGE,
        data:  { conversationId: CONVERSATION_ID, walkId: 'walk-1' },
      });
    });

    it('el chequeo de duplicado busca CHAT_MESSAGE sin leer de ESE usuario, con take (Ventana #4)', async () => {
      setupSendMessage('walk-1');

      await service.sendMessage(OWNER_USER_ID, UserRole.OWNER, CONVERSATION_ID, { content: 'hola' });
      await flushPromises();

      expect(prisma.notification.findMany).toHaveBeenCalledWith({
        where:  { userId: WALKER_USER_ID, type: NOTIFICATION_TYPES.CHAT_MESSAGE, isRead: false },
        select: { data: true },
        take:   50,
      });
    });

    it('segundo mensaje con la anterior SIN leer: no crea otra notificación', async () => {
      setupSendMessage('walk-1');
      prisma.notification.findMany.mockResolvedValue([
        { data: { conversationId: CONVERSATION_ID, walkId: 'walk-1' } },
      ]);

      await service.sendMessage(OWNER_USER_ID, UserRole.OWNER, CONVERSATION_ID, { content: 'otro mensaje' });
      await flushPromises();

      expect(notificationsService.create).not.toHaveBeenCalled();
    });

    it('segundo mensaje con la anterior YA LEÍDA: sí crea una nueva', async () => {
      setupSendMessage('walk-1');
      // "ya leída" = no aparece en el findMany de sin leer (isRead: false
      // va en el where) — la notificación anterior sigue existiendo en la
      // base, esta consulta simplemente no la trae.
      prisma.notification.findMany.mockResolvedValue([]);

      await service.sendMessage(OWNER_USER_ID, UserRole.OWNER, CONVERSATION_ID, { content: 'otro mensaje' });
      await flushPromises();

      expect(notificationsService.create).toHaveBeenCalledTimes(1);
    });

    it('una notificación sin leer de OTRA conversación no bloquea la de esta', async () => {
      setupSendMessage('walk-1');
      prisma.notification.findMany.mockResolvedValue([
        { data: { conversationId: 'otra-conversacion', walkId: 'otro-walk' } },
      ]);

      await service.sendMessage(OWNER_USER_ID, UserRole.OWNER, CONVERSATION_ID, { content: 'hola' });
      await flushPromises();

      expect(notificationsService.create).toHaveBeenCalledTimes(1);
    });

    it('conversation.walkId null: crea la notificación con data SIN walkId — nunca uno inventado', async () => {
      setupSendMessage(null);

      await service.sendMessage(OWNER_USER_ID, UserRole.OWNER, CONVERSATION_ID, { content: 'hola' });
      await flushPromises();

      expect(notificationsService.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: { conversationId: CONVERSATION_ID } }),
      );
      const data = notificationsService.create.mock.calls[0][0].data;
      expect(data.walkId).toBeUndefined();
    });

    it('si notificationsService.create rechaza, sendMessage() igual devuelve el mensaje — no propaga', async () => {
      setupSendMessage('walk-1');
      notificationsService.create.mockRejectedValue(new Error('boom'));

      const result = await service.sendMessage(OWNER_USER_ID, UserRole.OWNER, CONVERSATION_ID, { content: 'hola' });
      await flushPromises();

      expect(result).toEqual(MESSAGE_ROW);
    });

    it('el destinatario es quien NO mandó el mensaje — si manda el paseador, se notifica al dueño', async () => {
      setupSendMessage('walk-1');

      await service.sendMessage(WALKER_USER_ID, UserRole.WALKER, CONVERSATION_ID, { content: 'hola' });
      await flushPromises();

      expect(notificationsService.create).toHaveBeenCalledWith(
        expect.objectContaining({ userId: OWNER_USER_ID }),
      );
    });
  });
});
