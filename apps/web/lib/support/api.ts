import api from "@/lib/api";

// Cliente de la API del módulo de soporte (rebanada 1, solo lectura).
// Reusa la instancia compartida de axios (@/lib/api) — eso es
// infraestructura común, no pantalla — pero los tipos y los métodos son
// propios de soporte y viven acá adentro, no en lib/api.ts: cuando este
// panel se separe (docs/diseños/modulo-soporte.md §7bis, el día que Güau se
// empaquete para las tiendas), esta carpeta se muda entera y no deja nada
// pegado en el archivo compartido.

export interface SupportListMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// ─── Búsqueda — GET /support/walks ─────────────────────────────────────────

export interface SupportSearchQuery {
  idPrefix?: string;
  email?: string;
  desde?: string;
  hasta?: string;
  page?: number;
  limit?: number;
}

export interface SupportWalkRow {
  id: string;
  status: string;
  scheduledAt: string;
  walkType: { label: string };
  walker: { firstName: string };
  // null cuando el paseo rompe el invariante "un paseo, un dueño" (dato
  // corrupto en la base) — el backend lo loguea como error y abre la
  // pantalla igual. Ver support.service.ts, logBrokenOwnerInvariant.
  owner: { firstName: string } | null;
  dogs: Array<{ name: string }>;
}

export interface SupportSearchResponse {
  data: SupportWalkRow[];
  meta: SupportListMeta;
}

// ─── El caso completo — GET /support/walks/:id ─────────────────────────────

export interface SupportPerson {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
}

export interface SupportWalkCase {
  id: string;
  status: string;
  mode: string;
  scheduledAt: string;
  createdAt: string;
  onWayAt: string | null;
  startedAt: string | null;
  endedAt: string | null;
  notPerformedAt: string | null;
  startedLate: boolean;
  endedLate: boolean;
  closedBy: string | null;
  notPerformedReason: string | null;
  startVerification: string | null;
  startVerifyReason: string | null;
  ownerAcknowledgedNoCodeAt: string | null;
  pickupCode: string | null;
  pickupCodeAttempts: number;
  pickupAddress: string;
  pickupLat: number;
  pickupLng: number;
  totalAmount: number;
  walkerAmount: number;
  cancellationReason: string | null;
  // Booleano derivado de mpPaymentId — el id de sistema de MercadoPago NUNCA
  // sale de la API (mismo criterio que mpConnected sobre mpAccessToken).
  // "Había plata adentro y el paseo no se completó" es una de las señales
  // más importantes de un caso (hallazgo del testeo en staging, 2026-09-11).
  estabaPago: boolean;
  // A diferencia de mpPaymentId, refundedAt sí se expone directo: no es un
  // id de sistema, es una fecha, y con la fecha alcanza.
  refundedAt: string | null;
  walkType: { label: string; durationMinutes: number };
  walker: SupportPerson;
  owner: SupportPerson | null;
  dogs: Array<{ name: string; size: string }>;
}

// ─── El chat del paseo — GET /support/walks/:id/messages ───────────────────

export interface SupportMessagesQuery {
  page?: number;
  limit?: number;
}

export interface SupportMessage {
  id: string;
  content: string;
  createdAt: string;
  containsContactInfo: boolean;
  isRead: boolean;
  sender: { id: string; firstName: string; lastName: string; role: string };
}

// Distingue "el paseo nunca llegó a tener conversación" (nunca se
// confirmó) de "la conversación existe pero nadie escribió" — los dos daban
// data: [] antes de este campo, y el front no los podía diferenciar
// (hallazgo del testeo en staging, 2026-09-11). El conversationId nunca
// viaja: no hace falta para esto, es dato interno.
export interface SupportMessagesMeta extends SupportListMeta {
  conversationExists: boolean;
}

export interface SupportMessagesResponse {
  data: SupportMessage[];
  meta: SupportMessagesMeta;
}

export const supportAPI = {
  searchWalks: (params: SupportSearchQuery) =>
    api.get<SupportSearchResponse>("/support/walks", { params }),
  getCase: (id: string) =>
    api.get<SupportWalkCase>(`/support/walks/${id}`),
  getMessages: (id: string, params?: SupportMessagesQuery) =>
    api.get<SupportMessagesResponse>(`/support/walks/${id}/messages`, { params }),
};
