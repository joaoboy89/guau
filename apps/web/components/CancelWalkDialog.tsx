"use client";

import { Button } from "@/components/ui";

interface CancelWalkDialogProps {
  open: boolean;
  reason: string;
  onReasonChange: (value: string) => void;
  onDismiss: () => void;
  onConfirm: () => void;
  confirming: boolean;
  error?: string | null;
}

/**
 * Diálogo de confirmación propio (no window.confirm, que no respeta la
 * marca) para cancelar una reserva. Presentacional: quien lo usa maneja el
 * estado de la request (loading/error) y decide qué hacer al confirmar.
 *
 * Reusado en la vista del dueño (walks/[id]) y del paseador (walker/dashboard)
 * — es exactamente el mismo diálogo en los dos lugares, no una coincidencia
 * de texto.
 */
export default function CancelWalkDialog({
  open,
  reason,
  onReasonChange,
  onDismiss,
  onConfirm,
  confirming,
  error,
}: CancelWalkDialogProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4">
      <div className="w-full sm:max-w-sm bg-brand-surface rounded-2xl border border-brand-border shadow-float p-5 flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="font-serif text-lg font-bold text-brand-text">
            ¿Cancelar esta reserva?
          </h2>
          <p className="text-sm text-brand-text-body">
            Esta acción no se puede deshacer. La otra parte se entera al instante.
          </p>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-brand-text-muted">Motivo (opcional)</span>
          <textarea
            value={reason}
            onChange={(e) => onReasonChange(e.target.value)}
            maxLength={300}
            rows={3}
            className="rounded-xl border border-brand-border bg-brand-bg px-3 py-2 text-sm text-brand-text placeholder:text-brand-text-muted focus:outline-none focus:border-brand-primary resize-none"
          />
        </label>

        {error && <p className="text-xs text-red-700">{error}</p>}

        <div className="flex gap-2">
          <Button
            variant="secondary"
            className="flex-1"
            onClick={onDismiss}
            disabled={confirming}
          >
            Volver
          </Button>
          <Button
            variant="danger"
            className="flex-1"
            onClick={onConfirm}
            loading={confirming}
          >
            Sí, cancelar
          </Button>
        </div>
      </div>
    </div>
  );
}
