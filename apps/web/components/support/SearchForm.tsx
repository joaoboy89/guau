"use client";

import { useState, FormEvent } from "react";
import { Button, Input, Card } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { SupportSearchFields } from "@/lib/support/search-params";
import { getDateShortcutRange, matchingShortcut, type DateShortcut } from "@/lib/support/date-shortcuts";

const SHORTCUT_LABEL: Record<DateShortcut, string> = {
  hoy: "Hoy",
  ayer: "Ayer",
  "7dias": "Últimos 7 días",
};

// Tres campos separados, no uno que adivina (decisión de Joa, revirtiendo
// la propuesta inicial — docs/diseños/modulo-soporte.md §7bis): dos o mas
// campos se pueden COMBINAR ("el mail de Juan" + "el martes"), uno solo no.
// Y acompaña la conversación real, donde soporte va pidiendo datos y
// sumándolos.
export function SearchForm({
  onSearch,
  invalidAttempt,
}: {
  onSearch: (fields: SupportSearchFields) => void;
  /** true cuando el ultimo intento de busqueda tenia los cuatro campos vacios. */
  invalidAttempt: boolean;
}) {
  const [idPrefix, setIdPrefix] = useState("");
  const [email, setEmail] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    onSearch({ idPrefix, email, desde, hasta });
  };

  return (
    <Card as="form" onSubmit={handleSubmit} className="flex flex-col gap-4">
      {/* grid-cols-3 con dos inputs de fecha adentro de UN TERCIO de la
          grilla desbordaba: un <input type="date"> no se achica por debajo
          de su ancho de contenido salvo que se le fuerce min-width:0 en toda
          la cadena de flex/grid — sin eso, el segundo campo ("hasta") queda
          literalmente afuera del recuadro. Dos arreglos, no uno: el bloque
          de fechas pasa a ocupar la fila entera en pantallas intermedias
          (md:col-span-2) en vez de pelear por un tercio angosto, y cada
          input de fecha va en su propio min-w-0 para que, aun compartiendo
          espacio, se achique en vez de desbordar. */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        <Input
          label="Código del paseo"
          placeholder="a3f1b2c4"
          value={idPrefix}
          onChange={(e) => setIdPrefix(e.target.value)}
          maxLength={36}
        />
        <Input
          label="Mail de una de las partes"
          type="email"
          placeholder="dueño o paseador"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <div className="flex flex-col gap-1.5 md:col-span-2 xl:col-span-1">
          <span className="text-sm font-medium text-brand-text">Rango de fechas</span>
          {/* Atajos: llenan los mismos dos campos de abajo, no son otra
              logica (docs/diseños/modulo-soporte.md §7bis). Seleccionado
              cuando desde/hasta coinciden con su rango — si no, apretar el
              boton no muestra nada distinto. */}
          <div className="flex gap-1.5 flex-wrap">
            {(Object.keys(SHORTCUT_LABEL) as DateShortcut[]).map((shortcut) => {
              const active = matchingShortcut(desde, hasta) === shortcut;
              return (
                <button
                  key={shortcut}
                  type="button"
                  onClick={() => {
                    const range = getDateShortcutRange(shortcut);
                    setDesde(range.desde);
                    setHasta(range.hasta);
                  }}
                  className={cn(
                    "px-2.5 py-1 rounded-full text-xs font-semibold border transition-colors",
                    active
                      ? "bg-brand-primary text-white border-brand-primary"
                      : "bg-brand-surface text-brand-text-muted border-brand-border hover:bg-brand-surface-sand",
                  )}
                >
                  {SHORTCUT_LABEL[shortcut]}
                </button>
              );
            })}
          </div>
          <div className="flex gap-2">
            <div className="min-w-0 flex-1">
              <Input
                type="date"
                aria-label="Desde"
                value={desde}
                onChange={(e) => setDesde(e.target.value)}
              />
            </div>
            <div className="min-w-0 flex-1">
              <Input
                type="date"
                aria-label="Hasta"
                value={hasta}
                onChange={(e) => setHasta(e.target.value)}
              />
            </div>
          </div>
        </div>
      </div>

      {invalidAttempt && (
        <p className="text-sm text-red-600">
          Ingresá al menos un dato para buscar — el código, un mail, o una fecha.
        </p>
      )}

      <Button type="submit" className="w-fit">
        Buscar
      </Button>
    </Card>
  );
}
