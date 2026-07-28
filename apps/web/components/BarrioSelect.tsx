"use client";

import { useId } from "react";
import { cn } from "@/lib/cn";
import { BARRIOS, type Barrio } from "@/lib/barrios";

interface BarrioSelectProps {
  /** Nombre del barrio elegido, o "" si todavía no se eligió ninguno. */
  value: string;
  onChange: (barrio: Barrio | null) => void;
  label?: string;
  placeholder?: string;
  className?: string;
  id?: string;
}

// Solo localidades activas — el resto existe en el catálogo para poder
// encenderlas después, pero ofrecerlas hoy solo lleva a elegir una zona
// vacía (ver Barrio.activa en lib/barrios.ts).
const ACTIVE_BARRIOS = BARRIOS.filter((b) => b.activa);

// Agrupa por partido preservando el orden de aparición en BARRIOS (CABA
// primero, después cada partido en el orden en que se fue activando).
const GROUPS: Array<{ partido: string; barrios: Barrio[] }> = [];
for (const b of ACTIVE_BARRIOS) {
  let group = GROUPS.find((g) => g.partido === b.partido);
  if (!group) {
    group = { partido: b.partido, barrios: [] };
    GROUPS.push(group);
  }
  group.barrios.push(b);
}

export default function BarrioSelect({
  value,
  onChange,
  label = "Barrio",
  placeholder = "Elegí un barrio…",
  className,
  id,
}: BarrioSelectProps) {
  const generatedId = useId();
  const selectId = id ?? generatedId;

  return (
    <div className="flex w-full flex-col gap-1.5">
      {label && (
        <label htmlFor={selectId} className="text-sm font-medium text-brand-text">
          {label}
        </label>
      )}

      <select
        id={selectId}
        value={value}
        onChange={(e) => {
          const nombre = e.target.value;
          const barrio = ACTIVE_BARRIOS.find((b) => b.nombre === nombre) ?? null;
          onChange(barrio);
        }}
        className={cn(
          "h-12 w-full rounded-2xl border bg-brand-surface px-4",
          "text-brand-text",
          "transition-colors duration-150",
          "border-brand-border hover:border-brand-text-muted",
          "focus:outline-none focus:ring-2 focus:ring-brand-primary focus:border-transparent",
          className
        )}
      >
        <option value="">{placeholder}</option>
        {GROUPS.map((g) => (
          <optgroup key={g.partido} label={g.partido}>
            {g.barrios.map((b) => (
              <option key={b.nombre} value={b.nombre}>
                {b.nombre}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </div>
  );
}
