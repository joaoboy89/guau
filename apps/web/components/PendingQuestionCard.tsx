"use client";

import { useEffect, useRef, useState } from "react";
import { AxiosError } from "axios";
import { SUPPORT_EMAIL, type PendingQuestion } from "@guau/shared";
import { walksAPI } from "@/lib/api";
import { Button } from "@/components/ui";

interface PendingQuestionCardProps {
  question: PendingQuestion;
  /** Ya se confirmó en esta sesión — la tarjeta pasa a mostrar la leyenda. */
  acknowledgedAt: Date | null;
  onAcknowledged: (walkId: string, acknowledgedAt: Date) => void;
}

const TZ = "America/Argentina/Buenos_Aires";

function formatTime(iso: string | Date): string {
  return new Date(iso).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
}

function formatDayAndTime(date: Date): string {
  const day = date.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", timeZone: TZ });
  return `${day} a las ${formatTime(date)}`;
}

/**
 * Cartel del dashboard del dueño — cierre del bloque D1 (guau-politicas.md
 * §5). No se puede descartar sin responder (a propósito: no lleva "x" ni
 * "más tarde") porque leer no es lo mismo que estar de acuerdo — eso ya
 * falló una vez con la campanita, que marca como leída con el mismo click
 * que abre la notificación.
 *
 * Dos estados según question.status, un solo endpoint detrás de los dos
 * botones ("Estoy de acuerdo" / "Sí, está todo bien"): cambia el texto
 * porque cambia lo que el dueño está viendo (paseo en curso vs. ya
 * cerrado), no la acción que confirma.
 */
export default function PendingQuestionCard({
  question,
  acknowledgedAt,
  onAcknowledged,
}: PendingQuestionCardProps) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showWhy, setShowWhy] = useState(false);

  const handleAcknowledge = async () => {
    setConfirming(true);
    setError(null);
    try {
      const res = await walksAPI.acknowledgeNoCode(question.walkId);
      onAcknowledged(question.walkId, new Date(res.data.ownerAcknowledgedNoCodeAt));
      setShowWhy(false);
    } catch (err) {
      const msg = (err as AxiosError<{ message: string }>)?.response?.data?.message;
      setError(msg ?? "No se pudo confirmar. Probá de nuevo.");
    } finally {
      setConfirming(false);
    }
  };

  if (acknowledgedAt) {
    return (
      <div className="px-4 py-3 rounded-2xl bg-brand-green-soft border border-brand-green/30 text-sm font-semibold text-brand-green">
        Confirmaste el {formatDayAndTime(acknowledgedAt)}
      </div>
    );
  }

  const isCompleted = question.status === "COMPLETED";

  return (
    <div className="bg-brand-surface rounded-2xl p-5 shadow-card border border-brand-primary/30 flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        {isCompleted ? (
          <>
            <p className="text-sm font-semibold text-brand-text">
              El paseador finalizó el paseo de {question.dogsLabel}
              {question.endedAt && ` a las ${formatTime(question.endedAt)}`}
            </p>
            <p className="text-sm text-brand-text-body">
              El paseo había arrancado sin código — el paseador declaró: &quot;{question.startVerifyReason}&quot;.
            </p>
          </>
        ) : (
          <>
            <p className="text-sm font-semibold text-brand-text">
              El paseo de {question.dogsLabel} arrancó sin código
            </p>
            <p className="text-sm text-brand-text-body">
              El paseador declaró: &quot;{question.startVerifyReason}&quot;.
            </p>
          </>
        )}
      </div>

      {error && <p className="text-xs text-red-700">{error}</p>}

      <div className="flex items-center gap-4 flex-wrap">
        <Button size="sm" onClick={handleAcknowledge} loading={confirming}>
          {isCompleted ? "Sí, está todo bien" : "Estoy de acuerdo"}
        </Button>
        <button
          type="button"
          onClick={() => setShowWhy(true)}
          disabled={confirming}
          className="text-xs text-brand-text-muted underline disabled:opacity-50"
        >
          ¿por qué pasó esto?
        </button>
      </div>

      <WhyNoCodeDialog
        open={showWhy}
        question={question}
        onDismiss={() => setShowWhy(false)}
        onAcknowledge={handleAcknowledge}
        confirming={confirming}
        error={error}
      />
    </div>
  );
}

// ─── "¿Por qué pasó esto?" ────────────────────────────────────────────────

interface WhyNoCodeDialogProps {
  open: boolean;
  question: PendingQuestion;
  onDismiss: () => void;
  onAcknowledge: () => void;
  confirming: boolean;
  error: string | null;
}

const TITLE_ID = "why-no-code-dialog-title";

/**
 * Modal, no pantalla aparte: es contenido de lectura (motivo + una
 * explicación breve) más dos acciones, sin nada que se beneficie de tener
 * su propia URL — mismo criterio y mismo patrón visual que
 * CancelWalkDialog/StartWalkDialog. A diferencia del cartel que lo abre,
 * ESTE sí se puede cerrar sin responder (Escape/backdrop): cerrarlo no
 * resuelve nada, así que no hace falta bloquearlo.
 */
function WhyNoCodeDialog({
  open,
  question,
  onDismiss,
  onAcknowledge,
  confirming,
  error,
}: WhyNoCodeDialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    triggerRef.current = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();

    return () => {
      triggerRef.current?.focus();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape" || confirming) return;
      onDismiss();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, confirming, onDismiss]);

  if (!open) return null;

  const mailtoHref =
    `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(`Consulta sobre el paseo ${question.walkId}`)}`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4"
      onClick={() => {
        if (confirming) return;
        onDismiss();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={TITLE_ID}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-sm bg-brand-surface rounded-2xl border border-brand-border shadow-float p-5 flex flex-col gap-4"
      >
        <div className="flex flex-col gap-1">
          <h2 id={TITLE_ID} className="font-serif text-lg font-bold text-brand-text">
            ¿Por qué pasó esto?
          </h2>
          <p className="text-sm text-brand-text-body">
            El paseador declaró: &quot;{question.startVerifyReason}&quot;
          </p>
        </div>

        <p className="text-sm text-brand-text-muted">
          Esto pasa cuando el paseador retira a tu perro sin que nadie tipee el código de 4
          dígitos que le diste — puede ser un motivo válido (te lo recibió el portero, un
          familiar, no tenías el código a mano). No es una alerta de fraude: es un registro de
          cómo arrancó el paseo, por si alguna vez hace falta revisarlo.
        </p>

        {error && <p className="text-xs text-red-700">{error}</p>}

        <div className="flex gap-2">
          <a
            href={mailtoHref}
            className="flex-1 h-12 flex items-center justify-center rounded-2xl border border-brand-border bg-brand-surface text-brand-text-body font-semibold text-sm hover:bg-brand-surface-sand transition-colors"
          >
            Necesito ayuda
          </a>
          <Button className="flex-1" onClick={onAcknowledge} loading={confirming}>
            Estoy de acuerdo
          </Button>
        </div>
      </div>
    </div>
  );
}
