import { Card } from "@/components/ui";
import { formatDateTimeBA } from "@/lib/format-date";
import { buildTimeline, notPerformedReasonLabel } from "@/lib/support/timeline";
import type { SupportWalkCase } from "@/lib/support/api";

// La línea de tiempo (docs/diseños/modulo-soporte.md §7bis) — lo OCURRIDO,
// el eje de la pantalla. El valor de esta vista es que se vea el HUECO: un
// hito que no pasó se marca más fuerte que uno que sí, nunca se esconde.
export function CaseTimeline({ walk }: { walk: SupportWalkCase }) {
  const timeline = buildTimeline(walk);
  const reasonLabel = notPerformedReasonLabel(walk.notPerformedReason);

  return (
    <Card>
      <ol className="flex flex-col gap-3">
        {timeline.map((event) => (
          <li key={event.key} className="flex items-start gap-3">
            <span
              className={
                event.at
                  ? "w-2 h-2 rounded-full bg-brand-primary mt-1.5 shrink-0"
                  : "w-2 h-2 rounded-full border border-brand-text-muted mt-1.5 shrink-0"
              }
              aria-hidden="true"
            />
            <div className="flex flex-col gap-0.5">
              {event.at ? (
                <span className="text-xs text-brand-text-muted">{formatDateTimeBA(event.at)}</span>
              ) : (
                <span className="text-xs text-brand-text-muted italic">{event.missingLabel}</span>
              )}
              <span
                className={
                  event.at
                    ? "text-sm text-brand-text-body"
                    : "text-sm text-brand-text-muted italic"
                }
              >
                {event.label}
                {event.key === "notPerformedAt" && event.at && reasonLabel ? ` — ${reasonLabel}` : ""}
              </span>
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
}
