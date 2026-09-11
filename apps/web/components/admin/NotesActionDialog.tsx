"use client";

import { useEffect, useRef } from "react";
import { Button } from "@/components/ui";
import type { VerifyAction } from "@/lib/admin/walker-status";

interface NotesActionDialogProps {
  open: boolean;
  action: VerifyAction;
  title: string;
  description: string;
  // "Continuar" para reject (todavía falta la confirmación final) o el
  // verbo de la acción para suspend/reinstate, que se ejecutan directo.
  submitLabel: string;
  notes: string;
  onNotesChange: (value: string) => void;
  onDismiss: () => void;
  onSubmit: () => void;
  submitting: boolean;
  error?: string | null;
}

const TITLE_ID = "notes-action-dialog-title";

/**
 * Mismo patrón que CancelWalkDialog, pero con la nota OBLIGATORIA: el botón
 * de submit queda deshabilitado hasta que haya texto (reject/suspend/
 * reinstate exigen motivo en el backend — AdminService.verifyWalker).
 */
export default function NotesActionDialog({
  open,
  action,
  title,
  description,
  submitLabel,
  notes,
  onNotesChange,
  onDismiss,
  onSubmit,
  submitting,
  error,
}: NotesActionDialogProps) {
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

  const canSubmit = notes.trim().length > 0;

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
        className="w-full sm:max-w-md bg-brand-surface rounded-2xl border border-brand-border shadow-float p-5 flex flex-col gap-4"
      >
        <div className="flex flex-col gap-1">
          <h2 id={TITLE_ID} className="font-serif text-lg font-bold text-brand-text">
            {title}
          </h2>
          <p className="text-sm text-brand-text-body">{description}</p>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-brand-text-muted">
            Nota — obligatoria para {action === "reject" ? "rechazar" : action === "suspend" ? "suspender" : "reactivar"}
          </span>
          <textarea
            value={notes}
            onChange={(e) => onNotesChange(e.target.value)}
            maxLength={500}
            rows={4}
            autoFocus
            className="rounded-xl border border-brand-border bg-brand-bg px-3 py-2 text-sm text-brand-text placeholder:text-brand-text-muted focus:outline-none focus:border-brand-primary resize-none"
          />
        </label>

        {error && <p className="text-xs text-red-700">{error}</p>}

        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={onDismiss} disabled={submitting}>
            Volver
          </Button>
          <Button
            variant={action === "reject" ? "danger" : "primary"}
            className="flex-1"
            onClick={onSubmit}
            disabled={!canSubmit}
            loading={submitting}
          >
            {submitLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
