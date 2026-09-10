import { Card } from "@/components/ui";
import { formatDateTimeBA } from "@/lib/format-date";
import type { SupportPerson, SupportWalkCase } from "@/lib/support/api";

function PersonBlock({ label, person }: { label: string; person: SupportPerson | null }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-brand-text-muted">{label}</span>
      {person ? (
        <>
          <span className="font-medium text-brand-text-body">
            {person.firstName} {person.lastName}
          </span>
          <span className="text-sm text-brand-text-muted">{person.email}</span>
          <span className="text-sm text-brand-text-muted">{person.phone ?? "sin teléfono"}</span>
        </>
      ) : (
        // Invariante roto del lado del backend (support.service.ts): un
        // paseo sin participantes. No es el caso comun — se muestra tal
        // cual para que quede visible que el dato esta corrupto, no se
        // esconde con un valor inventado.
        <span className="text-sm text-red-600">Dato roto — paseo sin dueño registrado</span>
      )}
    </div>
  );
}

// La ficha (docs/diseños/modulo-soporte.md §7bis): lo PACTADO. Quiénes,
// cuándo, dónde, cuánto — el contraste contra la línea de tiempo (lo
// ocurrido) es lo que arma la pregunta que importa en una disputa.
export function CaseFicha({ walk }: { walk: SupportWalkCase }) {
  return (
    <Card>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <PersonBlock label="Dueño" person={walk.owner} />
        <PersonBlock label="Paseador" person={walk.walker} />

        <div className="flex flex-col gap-0.5">
          <span className="text-xs text-brand-text-muted">Hora pactada</span>
          <span className="font-medium text-brand-text-body">
            {formatDateTimeBA(new Date(walk.scheduledAt))}
          </span>
        </div>

        <div className="flex flex-col gap-0.5">
          <span className="text-xs text-brand-text-muted">Tipo de paseo</span>
          <span className="font-medium text-brand-text-body">
            {walk.walkType.label} ({walk.walkType.durationMinutes} min)
          </span>
        </div>

        <div className="flex flex-col gap-0.5 sm:col-span-2">
          <span className="text-xs text-brand-text-muted">Dónde</span>
          <span className="font-medium text-brand-text-body">{walk.pickupAddress}</span>
        </div>

        <div className="flex flex-col gap-0.5">
          <span className="text-xs text-brand-text-muted">
            {walk.dogs.length === 1 ? "Perro" : "Perros"}
          </span>
          <span className="font-medium text-brand-text-body">
            {walk.dogs.length > 0 ? walk.dogs.map((d) => d.name).join(", ") : "—"}
          </span>
        </div>

        <div className="flex flex-col gap-0.5">
          <span className="text-xs text-brand-text-muted">Monto</span>
          <span className="font-medium text-brand-text-body">
            ${walk.totalAmount.toLocaleString("es-AR")} total · $
            {walk.walkerAmount.toLocaleString("es-AR")} para el paseador
          </span>
        </div>

        {walk.cancellationReason && (
          <div className="flex flex-col gap-0.5 sm:col-span-2">
            <span className="text-xs text-brand-text-muted">Motivo de cancelación</span>
            <span className="font-medium text-brand-text-body">{walk.cancellationReason}</span>
          </div>
        )}
      </div>
    </Card>
  );
}
