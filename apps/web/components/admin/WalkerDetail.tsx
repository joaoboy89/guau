"use client";

import { useState } from "react";
import { AxiosError } from "axios";
import { Badge, Button, Card } from "@/components/ui";
import { formatDateTimeBA } from "@/lib/format-date";
import ConfirmDialog from "@/components/ConfirmDialog";
import NotesActionDialog from "./NotesActionDialog";
import {
  AVAILABLE_ACTIONS,
  ACTION_LABEL,
  STATUS_BADGE,
  actionRequiresNotes,
  actionRequiresExtraConfirmation,
  parseNotesHistory,
  type VerifyAction,
} from "@/lib/admin/walker-status";
import { adminWalkersAPI, type AdminWalkerRow } from "@/lib/admin/api";

const METHOD_LABEL: Record<string, string> = {
  PERSONAL: "conocido personal",
  DOCUMENT: "documento",
  SID: "RENAPER",
  DIDIT: "Didit",
};

/**
 * Perfil + historial de notas + acciones disponibles para el estado actual.
 * REJECTED sin botones a propósito: el estado terminal tiene que verse, no
 * solo estar aplicado del lado del backend
 * (docs/diseños/verificacion-de-paseadores.md §6).
 */
export function WalkerDetail({
  walker,
  onClose,
  onDone,
}: {
  walker: AdminWalkerRow;
  onClose: () => void;
  onDone: () => void;
}) {
  const [pendingAction, setPendingAction] = useState<VerifyAction | null>(null);
  const [notes, setNotes] = useState("");
  const [confirmingReject, setConfirmingReject] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [approving, setApproving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const badge = STATUS_BADGE[walker.verificationStatus];
  const notesHistory = parseNotesHistory(walker.verificationNotes);
  const actions = AVAILABLE_ACTIONS[walker.verificationStatus];

  const resetDialogs = () => {
    setPendingAction(null);
    setNotes("");
    setConfirmingReject(false);
    setActionError(null);
  };

  const runAction = async (action: VerifyAction, actionNotes?: string) => {
    setSubmitting(true);
    setActionError(null);
    try {
      await adminWalkersAPI.verifyWalker(walker.id, { action, notes: actionNotes || undefined });
      resetDialogs();
      onDone();
    } catch (err) {
      const msg = (err as AxiosError<{ message: string }>)?.response?.data?.message;
      setActionError(msg ?? "No se pudo completar la acción. Probá de nuevo en un momento.");
    } finally {
      setSubmitting(false);
      setApproving(false);
    }
  };

  const handleActionClick = (action: VerifyAction) => {
    if (!actionRequiresNotes(action)) {
      setApproving(true);
      void runAction(action);
      return;
    }
    setActionError(null);
    setNotes("");
    setPendingAction(action);
  };

  const handleNotesSubmit = () => {
    if (!pendingAction) return;
    if (actionRequiresExtraConfirmation(pendingAction)) {
      setConfirmingReject(true);
      return;
    }
    void runAction(pendingAction, notes);
  };

  return (
    <Card padding="lg" className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="font-serif text-xl font-bold text-brand-text">
            {walker.user.firstName} {walker.user.lastName}
          </h2>
          <p className="text-sm text-brand-text-muted">
            {walker.user.email}
            {walker.user.phone ? ` · ${walker.user.phone}` : ""}
          </p>
          <p className="text-xs text-brand-text-muted">
            Registrado el {formatDateTimeBA(new Date(walker.user.createdAt))}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={badge.variant}>{badge.label}</Badge>
          <button onClick={onClose} className="text-sm text-brand-text-muted hover:opacity-70">
            Cerrar
          </button>
        </div>
      </div>

      {walker.bio && <p className="text-sm text-brand-text-body">{walker.bio}</p>}

      <div className="flex flex-col gap-1 text-sm text-brand-text-body">
        <p>
          ★ {walker.rating.toFixed(1)} ({walker.totalReviews} reseña{walker.totalReviews === 1 ? "" : "s"})
        </p>
        {walker.verifiedAt && (
          <p className="text-brand-text-muted">
            Verificado el {formatDateTimeBA(new Date(walker.verifiedAt))}
            {walker.verificationMethod
              ? ` — ${METHOD_LABEL[walker.verificationMethod] ?? walker.verificationMethod}`
              : ""}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <p className="text-xs font-semibold text-brand-text-muted uppercase tracking-wide">
          Historial de notas
        </p>
        {notesHistory.length > 0 ? (
          <ul className="flex flex-col gap-1 text-sm text-brand-text-body">
            {notesHistory.map((line, i) => (
              <li key={i} className="px-3 py-2 rounded-xl bg-brand-surface-sand">
                {line}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-brand-text-muted">Sin notas todavía.</p>
        )}
      </div>

      {actionError && !pendingAction && !confirmingReject && (
        <p className="text-xs text-red-700">{actionError}</p>
      )}

      {actions.length > 0 ? (
        <div className="flex gap-2 flex-wrap">
          {actions.map((action) => (
            <Button
              key={action}
              variant={action === "reject" ? "danger" : action === "approve" ? "primary" : "secondary"}
              size="sm"
              onClick={() => handleActionClick(action)}
              loading={approving && action === "approve"}
            >
              {ACTION_LABEL[action]}
            </Button>
          ))}
        </div>
      ) : (
        <p className="text-sm text-brand-text-muted italic">
          Rechazado definitivamente — no hay ninguna acción disponible.
        </p>
      )}

      <NotesActionDialog
        open={pendingAction !== null && !confirmingReject}
        action={pendingAction ?? "suspend"}
        title={pendingAction ? `${ACTION_LABEL[pendingAction]} paseador` : ""}
        description={
          pendingAction === "reject"
            ? "Contá el motivo del rechazo. En el próximo paso vas a confirmar — el rechazo es definitivo."
            : "Contá el motivo — queda guardado en el historial del paseador."
        }
        submitLabel={pendingAction === "reject" ? "Continuar" : pendingAction ? ACTION_LABEL[pendingAction] : ""}
        notes={notes}
        onNotesChange={setNotes}
        onDismiss={resetDialogs}
        onSubmit={handleNotesSubmit}
        submitting={submitting}
        error={actionError}
      />

      <ConfirmDialog
        open={confirmingReject}
        title="¿Rechazar definitivamente a este paseador?"
        description="Esta acción no se puede deshacer: rechazado es un estado final, nunca vuelve a poder trabajar en Güau."
        confirmLabel="Sí, rechazar"
        onDismiss={() => setConfirmingReject(false)}
        onConfirm={() => void runAction("reject", notes)}
        confirming={submitting}
        error={actionError}
      />
    </Card>
  );
}
