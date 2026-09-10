import type { SupportWalkCase } from "./api";

export interface TimelineEvent {
  key: string;
  label: string;
  /** null cuando el hito no ocurrió — el hueco que la vista tiene que mostrar. */
  at: Date | null;
  /** Texto para cuando `at` es null — distinto por hito, no un "—" generico. */
  missingLabel: string;
}

const NOT_PERFORMED_REASON_LABEL: Record<string, string> = {
  WALKER_NO_SHOW: "el paseador nunca llegó",
  ON_WAY_NEVER_STARTED: "marcó en camino y después silencio",
  OWNER_NO_SHOW: "el dueño no se presentó (declarado por el paseador)",
  NOBODY_ACTED: "ninguna parte actuó",
  NEVER_CONFIRMED: "quedó pendiente y venció",
};

export function notPerformedReasonLabel(reason: string | null): string | null {
  if (!reason) return null;
  return NOT_PERFORMED_REASON_LABEL[reason] ?? reason;
}

/**
 * La línea de tiempo (docs/diseños/modulo-soporte.md §7bis): lo OCURRIDO,
 * ordenado por timestamp real — los campos no siempre vienen en orden
 * cronológico en el objeto (createdAt es días antes de scheduledAt, pero
 * onWayAt puede caer antes o después de esa misma hora pactada según cuándo
 * arrancó el paseador). Los hitos que NO ocurrieron (at: null) van al final,
 * en el orden fijo en que están declarados acá — no tiene fecha de la cual
 * ordenarlos, y esconderlos sería exactamente lo que el diseño pide evitar:
 * "un hito que no ocurrió tiene que notarse MÁS que uno que sí".
 *
 * Función pura, testeable sin montar el componente.
 */
export function buildTimeline(walk: SupportWalkCase): TimelineEvent[] {
  const events: TimelineEvent[] = [
    {
      key: "createdAt",
      label: "Reservado",
      at: new Date(walk.createdAt),
      missingLabel: "",
    },
    {
      key: "onWayAt",
      label: 'El paseador marcó "en camino"',
      at: walk.onWayAt ? new Date(walk.onWayAt) : null,
      missingLabel: "— nunca marcó \"en camino\"",
    },
    {
      key: "scheduledAt",
      label: "Hora pactada",
      at: new Date(walk.scheduledAt),
      missingLabel: "",
    },
    {
      key: "startedAt",
      label: "Inicio",
      at: walk.startedAt ? new Date(walk.startedAt) : null,
      missingLabel: "— nunca inició",
    },
    {
      key: "endedAt",
      label: "Fin",
      at: walk.endedAt ? new Date(walk.endedAt) : null,
      missingLabel: "— nunca cerró",
    },
    {
      key: "notPerformedAt",
      label: "Marcado como no realizado",
      at: walk.notPerformedAt ? new Date(walk.notPerformedAt) : null,
      missingLabel: "— no aplica",
    },
  ];

  const happened = events
    .filter((e): e is TimelineEvent & { at: Date } => e.at !== null)
    .sort((a, b) => a.at.getTime() - b.at.getTime());
  const missing = events.filter((e) => e.at === null);

  return [...happened, ...missing];
}
