import { getSupportSignals, getEmptySignalsMessage } from "@/lib/support/signals";
import type { SupportWalkCase } from "@/lib/support/api";

// La franja de señales (docs/diseños/modulo-soporte.md §7bis), arriba de
// todo: solo lo anómalo. Deny-by-default aplicado a la atención — no se
// muestran ~25 campos con el mismo peso, se muestra lo que merece que lo
// miren. Y cuando no hay nada raro, lo dice: la ausencia tambien informa,
// nunca un espacio vacio que no se sabe si esta vacio o si no cargo.
//
// "Sin señales" SOLO para COMPLETED — un paseo NOT_PERFORMED o CANCELLED_*
// nunca cae acá (getSupportSignals() siempre les deja al menos una señal);
// un paseo en curso usa el texto de "todavía no terminó", nunca "transcurrió
// normal" (todavía no transcurrió). Ver getEmptySignalsMessage().
export function SignalsBanner({ walk }: { walk: SupportWalkCase }) {
  const signals = getSupportSignals(walk);

  if (signals.length === 0) {
    return (
      <div className="rounded-2xl border border-brand-border bg-brand-surface-sand px-4 py-3 text-sm text-brand-text-muted">
        {getEmptySignalsMessage(walk.status)}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 flex flex-col gap-1.5">
      {signals.map((signal) => (
        <p key={signal} className="text-sm text-amber-800 flex items-start gap-2">
          <span aria-hidden="true">⚠</span>
          <span>{signal}</span>
        </p>
      ))}
    </div>
  );
}
