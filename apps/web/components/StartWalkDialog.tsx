"use client";

import { useEffect, useRef } from "react";
import { Button } from "@/components/ui";
import {
  START_WITHOUT_CODE_REASON,
  START_WITHOUT_CODE_REASON_LABEL,
  START_WITHOUT_CODE_OTHER_MAX_LENGTH,
  PICKUP_CODE,
  type StartWithoutCodeReason,
} from "@guau/shared";

type Mode = "code" | "reason";

interface StartWalkDialogProps {
  open: boolean;
  mode: Mode;
  onModeChange: (mode: Mode) => void;
  code: string;
  onCodeChange: (value: string) => void;
  reason: StartWithoutCodeReason | "";
  onReasonChange: (value: StartWithoutCodeReason | "") => void;
  otherReason: string;
  onOtherReasonChange: (value: string) => void;
  onDismiss: () => void;
  onSubmit: () => void;
  submitting: boolean;
  error?: string | null;
}

const TITLE_ID = "start-walk-dialog-title";
const REASON_OPTIONS = Object.values(START_WITHOUT_CODE_REASON) as StartWithoutCodeReason[];

/**
 * Dos pantallas en un mismo diálogo — no dos diálogos separados — porque
 * "no tengo el código" es una salida DESDE la pantalla del código, no una
 * decisión que el paseador toma antes de abrir nada (docs/guau-politicas.md
 * §3: el paseo siempre puede arrancar, este es el camino legítimo cuando el
 * dueño no está). El link para cambiar de modo vive visible, sin esconderse
 * detrás de un menú — es un camino frecuente, no una excepción vergonzante.
 *
 * Mismo patrón de foco/Escape/backdrop que CancelWalkDialog y ConfirmDialog.
 */
export default function StartWalkDialog({
  open,
  mode,
  onModeChange,
  code,
  onCodeChange,
  reason,
  onReasonChange,
  otherReason,
  onOtherReasonChange,
  onDismiss,
  onSubmit,
  submitting,
  error,
}: StartWalkDialogProps) {
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
      if (e.key !== "Escape" || submitting) return;
      onDismiss();
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, submitting, onDismiss]);

  if (!open) return null;

  const canSubmit =
    mode === "code"
      ? code.length === PICKUP_CODE.LENGTH
      : reason !== "" && (reason !== START_WITHOUT_CODE_REASON.OTHER || otherReason.trim().length > 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4"
      onClick={() => {
        if (submitting) return;
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
        {mode === "code" ? (
          <>
            <div className="flex flex-col gap-1">
              <h2 id={TITLE_ID} className="font-serif text-lg font-bold text-brand-text">
                Código de retiro
              </h2>
              <p className="text-sm text-brand-text-body">
                Pedile al dueño los 4 dígitos que le mandamos al confirmar el paseo.
              </p>
            </div>

            <input
              value={code}
              onChange={(e) =>
                onCodeChange(e.target.value.replace(/\D/g, "").slice(0, PICKUP_CODE.LENGTH))
              }
              inputMode="numeric"
              autoFocus
              maxLength={PICKUP_CODE.LENGTH}
              placeholder="0000"
              aria-label="Código de retiro de 4 dígitos"
              className="text-center text-2xl tracking-[0.5em] font-semibold rounded-xl border border-brand-border bg-brand-bg py-3 text-brand-text placeholder:text-brand-text-muted/50 focus:outline-none focus:border-brand-primary"
            />

            {error && <p className="text-xs text-red-700">{error}</p>}

            <div className="flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={onDismiss} disabled={submitting}>
                Volver
              </Button>
              <Button className="flex-1" onClick={onSubmit} loading={submitting} disabled={!canSubmit}>
                Iniciar paseo
              </Button>
            </div>

            <button
              type="button"
              onClick={() => onModeChange("reason")}
              disabled={submitting}
              className="text-xs text-brand-text-muted underline text-center disabled:opacity-50"
            >
              No tengo el código
            </button>
          </>
        ) : (
          <>
            <div className="flex flex-col gap-1">
              <h2 id={TITLE_ID} className="font-serif text-lg font-bold text-brand-text">
                Iniciar sin código
              </h2>
              <p className="text-sm text-brand-text-body">
                El paseo arranca igual. Contanos por qué no tenés el código — queda
                registrado junto con el paseo.
              </p>
            </div>

            <div className="flex flex-col gap-2">
              {REASON_OPTIONS.map((option) => (
                <label
                  key={option}
                  className="flex items-center gap-2 text-sm text-brand-text-body cursor-pointer"
                >
                  <input
                    type="radio"
                    name="start-without-code-reason"
                    checked={reason === option}
                    onChange={() => onReasonChange(option)}
                    className="accent-brand-primary"
                  />
                  {START_WITHOUT_CODE_REASON_LABEL[option]}
                </label>
              ))}
            </div>

            {reason === START_WITHOUT_CODE_REASON.OTHER && (
              <textarea
                value={otherReason}
                onChange={(e) => onOtherReasonChange(e.target.value)}
                maxLength={START_WITHOUT_CODE_OTHER_MAX_LENGTH}
                rows={2}
                autoFocus
                placeholder="Contanos qué pasó"
                aria-label="Motivo por el que iniciás sin código"
                className="rounded-xl border border-brand-border bg-brand-bg px-3 py-2 text-sm text-brand-text placeholder:text-brand-text-muted focus:outline-none focus:border-brand-primary resize-none"
              />
            )}

            {error && <p className="text-xs text-red-700">{error}</p>}

            <div className="flex gap-2">
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => onModeChange("code")}
                disabled={submitting}
              >
                Volver
              </Button>
              <Button className="flex-1" onClick={onSubmit} loading={submitting} disabled={!canSubmit}>
                Iniciar paseo
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
