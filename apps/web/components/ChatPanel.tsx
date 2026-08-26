"use client";

import { useEffect, useRef, useState } from "react";
import { AxiosError } from "axios";
import { SOCKET_EVENTS, hasBlockingContactInfo } from "@guau/shared";
import { chatAPI, type ChatMessage } from "@/lib/api";
import { useAuth } from "@/lib/store";
import { connectSocket, getSocket, joinUser } from "@/lib/socket";
import { Button, Input, Spinner } from "@/components/ui";

interface ChatPanelProps {
  walkId: string;
}

interface MessagePayload {
  conversationId: string;
  message: ChatMessage;
}

/**
 * El chat de un paseo puntual — no una bandeja global (bloque 2.1: la
 * puerta es el paseo, no una pantalla de "Mensajes"). Se muestra solo
 * cuando el paseo llegó a WALKER_ON_WAY/IN_PROGRESS (quien renderiza este
 * componente ya filtró por eso). El backend ya cierra el acceso solo cuando
 * el paseo cierra (403) — este componente no duplica esa regla, si el
 * fetch inicial falla simplemente no muestra nada útil que mostrar.
 *
 * No hay endpoint "walkId → conversationId": se reusa GET /conversations
 * (ya trae take: 50 de techo) y se busca la fila cuyo walk.id matchea. Es
 * una consulta de más, pero evita abrir una superficie nueva en el backend
 * solo para esto.
 */
export default function ChatPanel({ walkId }: ChatPanelProps) {
  const { user } = useAuth();

  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [content, setContent] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    setLoading(true);
    setLoadError(null);

    chatAPI
      .list()
      .then((res) => {
        const conversation = res.data.find((c) => c.walk?.id === walkId);
        if (!conversation) {
          if (!cancelled) setLoadError("No se encontró el chat de este paseo.");
          return null;
        }
        if (cancelled) return null;
        setConversationId(conversation.id);
        return chatAPI.messages(conversation.id);
      })
      .then((msgsRes) => {
        if (cancelled || !msgsRes) return;
        setMessages(msgsRes.data);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const axiosErr = err as AxiosError<{ message: string }>;
        setLoadError(axiosErr?.response?.data?.message ?? "No se pudo cargar el chat.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [walkId, user]);

  // Mismo socket compartido que ya usa la campanita (NotificationsBell) —
  // conectar/unirse acá es idempotente (connectSocket no reabre si ya está
  // conectado; unirse dos veces a la misma sala del lado del servidor no
  // hace nada raro), y deja este componente autónomo aunque se use en una
  // pantalla donde por lo que sea el header no montó antes.
  useEffect(() => {
    if (!user) return;
    connectSocket();
    joinUser(user.id);
  }, [user]);

  useEffect(() => {
    if (!conversationId) return;

    const socket = getSocket();
    const handleNew = (payload: MessagePayload) => {
      if (payload.conversationId !== conversationId) return;
      setMessages((prev) =>
        prev.some((m) => m.id === payload.message.id) ? prev : [...prev, payload.message]
      );
    };

    socket.on(SOCKET_EVENTS.MESSAGE_NEW, handleNew);
    return () => {
      socket.off(SOCKET_EVENTS.MESSAGE_NEW, handleNew);
    };
  }, [conversationId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  const handleSend = async () => {
    const trimmed = content.trim();
    if (!trimmed || !conversationId || sending) return;

    // Mismo chequeo que la API, misma función de @guau/shared que usa
    // sendMessage() del lado del servidor — una sola fuente de verdad, sin
    // duplicar regex. Acá es comodidad (avisar antes de mandar); la defensa
    // real sigue siendo el 400 del servidor, que corre igual aunque este
    // chequeo tuviera un bug o alguien lo saltee llamando a la API directo.
    // Sin "mandar igual": Joa decidió que este nivel bloquea.
    if (hasBlockingContactInfo(trimmed)) {
      setSendError(
        "Este mensaje parece tener un dato de contacto (teléfono, mail, usuario o link). " +
        "Sacalo y reescribilo — el chat es para coordinar el paseo."
      );
      return;
    }

    setSending(true);
    setSendError(null);
    try {
      const res = await chatAPI.send(conversationId, trimmed);
      setMessages((prev) => (prev.some((m) => m.id === res.data.id) ? prev : [...prev, res.data]));
      setContent("");
    } catch (err: unknown) {
      const axiosErr = err as AxiosError<{ message: string }>;
      if (!axiosErr?.response?.status) {
        setSendError("No pudimos conectarnos. Revisá tu conexión e intentá de nuevo.");
      } else {
        setSendError(axiosErr.response?.data?.message ?? "No se pudo enviar el mensaje. Intentá de nuevo.");
      }
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Spinner />
      </div>
    );
  }

  // Sin conversación (todavía no se creó, o el paseo ya cerró y salió de la
  // lista): no hay nada útil que mostrar acá, y quien renderiza este
  // componente ya decidió mostrarlo solo para paseos en curso.
  if (loadError || !conversationId) return null;

  // Sin chrome de tarjeta propio (sin border/bg/padding): quien lo usa
  // decide el contenedor — en la pantalla de detalle del dueño es una
  // sección más entre otras con el mismo estilo de card; en el diálogo del
  // paseador (ChatDialog) el panel del modal ya pone el borde, ponerlo acá
  // también dejaba un borde adentro de otro borde.
  return (
    <div className="flex flex-col gap-3 min-h-0">
      <div className="flex flex-col gap-2 max-h-80 overflow-y-auto">
        {messages.length === 0 ? (
          <p className="text-xs text-brand-text-muted text-center py-4">
            Todavía no hay mensajes. Arrancá la conversación.
          </p>
        ) : (
          messages.map((m) => {
            const isOwn = m.senderId === user?.id;
            return (
              <div key={m.id} className={`flex ${isOwn ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm break-words ${
                    isOwn
                      ? "bg-brand-primary text-white"
                      : "bg-brand-surface-sand text-brand-text-body"
                  }`}
                >
                  {m.content}
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {sendError && <p className="text-xs text-red-700">{sendError}</p>}

      <div className="flex gap-2 items-start">
        <div className="flex-1">
          <Input
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void handleSend();
              }
            }}
            maxLength={1000}
            placeholder="Escribí un mensaje…"
            aria-label="Mensaje"
          />
        </div>
        <Button size="md" onClick={handleSend} loading={sending} disabled={!content.trim()}>
          Enviar
        </Button>
      </div>
    </div>
  );
}
