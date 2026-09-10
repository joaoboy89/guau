"use client";

import { useState } from "react";
import { AxiosError } from "axios";
import { Button, Badge, Spinner } from "@/components/ui";
import { formatDateTimeBA } from "@/lib/format-date";
import { supportAPI, type SupportMessage } from "@/lib/support/api";

// El botón del chat (docs/diseños/modulo-soporte.md §7bis): leer la
// conversación privada de dos personas es un acto deliberado, no algo que
// se abre solo — por eso esto es un click explícito y no un fetch automático
// al entrar a la pantalla. La línea "el acceso queda registrado" se queda
// aunque hoy el único que lee sea Joa: es honesta, y el día que quien lea
// sea un empleado funciona como recordatorio de que la lectura deja rastro
// (el backend loguea el acceso en GET /support/walks/:id/messages).
export function ChatSection({ walkId }: { walkId: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<SupportMessage[] | null>(null);

  const handleOpen = async () => {
    setOpen(true);
    if (messages !== null) return; // ya la trajimos, no se re-pide sola
    setLoading(true);
    setError(null);
    try {
      const res = await supportAPI.getMessages(walkId);
      setMessages(res.data.data);
    } catch (err) {
      const msg = (err as AxiosError<{ message: string }>)?.response?.data?.message;
      setError(msg ?? "No se pudo cargar la conversación. Probá de nuevo en un momento.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      {!open && (
        <div className="flex flex-col items-start gap-1">
          <Button variant="secondary" onClick={handleOpen}>
            Ver la conversación
          </Button>
          <span className="text-xs text-brand-text-muted">el acceso queda registrado</span>
        </div>
      )}

      {open && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-brand-text-body">Conversación</span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-xs text-brand-text-muted underline"
            >
              ocultar
            </button>
          </div>
          <span className="text-xs text-brand-text-muted">el acceso queda registrado</span>

          {loading && (
            <div className="flex justify-center py-6">
              <Spinner size={24} />
            </div>
          )}

          {error && (
            <div className="px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">
              {error}
            </div>
          )}

          {!loading && !error && messages !== null && messages.length === 0 && (
            <p className="text-sm text-brand-text-muted">Este paseo todavía no tiene conversación.</p>
          )}

          {!loading && !error && messages !== null && messages.length > 0 && (
            <ul className="flex flex-col gap-2 max-h-96 overflow-y-auto">
              {messages.map((m) => (
                <li key={m.id} className="rounded-xl border border-brand-border bg-brand-surface-sand p-3">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-xs font-semibold text-brand-text-body">
                      {m.sender.firstName} {m.sender.lastName}{" "}
                      <span className="font-normal text-brand-text-muted">({m.sender.role})</span>
                    </span>
                    <span className="text-xs text-brand-text-muted shrink-0">
                      {formatDateTimeBA(new Date(m.createdAt))}
                    </span>
                  </div>
                  <p className="text-sm text-brand-text-body">{m.content}</p>
                  {m.containsContactInfo && (
                    <Badge variant="warning" className="mt-2">
                      ⚠ posible dato de contacto
                    </Badge>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
