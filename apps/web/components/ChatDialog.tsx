"use client";

import { useEffect, useRef } from "react";
import ChatPanel from "@/components/ChatPanel";

interface ChatDialogProps {
  open: boolean;
  walkId: string | null;
  dogName: string;
  onDismiss: () => void;
  fallbackFocusId?: string;
}

const TITLE_ID = "chat-dialog-title";

/**
 * Envoltorio modal de ChatPanel para el dashboard del paseador — a
 * diferencia de la pantalla de detalle del dueño, acá no hay una página por
 * paseo, así que el chat de un paseo activo se abre como diálogo desde su
 * tarjeta. Mismo patrón de foco/Escape/backdrop que ConfirmDialog
 * (`fallbackFocusId` incluido: la tarjeta que lo abrió puede desmontarse
 * mientras está abierto, si el paseo pasa a COMPLETED).
 */
export default function ChatDialog({
  open,
  walkId,
  dogName,
  onDismiss,
  fallbackFocusId,
}: ChatDialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const pressedBackdrop = useRef(false);

  useEffect(() => {
    if (!open) return;

    triggerRef.current = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();

    return () => {
      const back = triggerRef.current;
      if (back && document.contains(back)) {
        back.focus();
        return;
      }
      if (fallbackFocusId) document.getElementById(fallbackFocusId)?.focus();
    };
  }, [open, fallbackFocusId]);

  useEffect(() => {
    if (!open) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      onDismiss();
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onDismiss]);

  if (!open || !walkId) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4"
      onMouseDown={(e) => {
        pressedBackdrop.current = e.target === e.currentTarget;
      }}
      onClick={() => {
        if (!pressedBackdrop.current) return;
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
        className="w-full sm:max-w-md bg-brand-surface rounded-2xl border border-brand-border shadow-float p-5 flex flex-col gap-3 max-h-[85dvh]"
      >
        <div className="flex items-center justify-between gap-2">
          <h2 id={TITLE_ID} className="font-serif text-lg font-bold text-brand-text">
            Chat — {dogName}
          </h2>
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Cerrar chat"
            className="text-brand-text-muted hover:opacity-70 transition-opacity text-xl leading-none px-1"
          >
            ×
          </button>
        </div>

        <ChatPanel walkId={walkId} />
      </div>
    </div>
  );
}
