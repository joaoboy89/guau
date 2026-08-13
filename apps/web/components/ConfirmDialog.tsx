"use client";

import { useEffect, useRef } from "react";
import { Button } from "@/components/ui";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  onDismiss: () => void;
  onConfirm: () => void;
  confirming: boolean;
  error?: string | null;
}

const TITLE_ID = "confirm-dialog-title";

/**
 * Dialogo de confirmacion generico: titulo, texto y dos botones. Nada mas.
 *
 * **Por que no se reuso `CancelWalkDialog`:** ese dialogo tiene un textarea de
 * motivo obligatorio en su interfaz (`reason` + `onReasonChange`), y titulo y
 * copy escritos a mano para cancelar. Generalizarlo pedia cinco props nuevas
 * —titulo, texto, label del boton, variante y "mostrar o no el motivo"— para
 * que los dos usos se pisaran menos de lo que se comparten. Un dialogo simple
 * cuesta menos de leer que uno configurable, y deja al de cancelar con su
 * unica responsabilidad.
 *
 * Mismos primitivos, mismo estilo y mismo comportamiento de foco/Escape que
 * `CancelWalkDialog`, a proposito: el usuario no tiene que notar que son dos
 * componentes.
 */
export default function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  onDismiss,
  onConfirm,
  confirming,
  error,
}: ConfirmDialogProps) {
  const panelRef   = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  // Donde empezo el gesto, no donde termino: un `click` del navegador se
  // dispara en el ancestro comun cuando el mousedown y el mouseup ocurren en
  // elementos distintos. Sin esto, arrastrar desde adentro del panel y soltar
  // afuera cierra el dialogo. (`e.target === e.currentTarget` no alcanza: en
  // ese caso el target del click ES el backdrop.)
  const pressedBackdrop = useRef(false);

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

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4"
      onMouseDown={(e) => {
        pressedBackdrop.current = e.target === e.currentTarget;
      }}
      onClick={() => {
        if (confirming || !pressedBackdrop.current) return;
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
            {title}
          </h2>
          <p className="text-sm text-brand-text-body">{description}</p>
        </div>

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
          <Button className="flex-1" onClick={onConfirm} loading={confirming}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
