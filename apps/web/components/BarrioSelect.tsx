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

const CABA = BARRIOS.filter((b) => b.zona === "CABA");
const GBA = BARRIOS.filter((b) => b.zona === "GBA");

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
          const barrio = BARRIOS.find((b) => b.nombre === nombre) ?? null;
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
        <optgroup label="CABA">
          {CABA.map((b) => (
            <option key={b.nombre} value={b.nombre}>
              {b.nombre}
            </option>
          ))}
        </optgroup>
        <optgroup label="GBA">
          {GBA.map((b) => (
            <option key={b.nombre} value={b.nombre}>
              {b.nombre}
            </option>
          ))}
        </optgroup>
      </select>
    </div>
  );
}
