"use client";

import { useState, FormEvent } from "react";
import { Button, Input, Card } from "@/components/ui";
import type { SupportSearchFields } from "@/lib/support/search-params";

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
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-brand-text">Rango de fechas</span>
          <div className="flex gap-2">
            <Input
              type="date"
              aria-label="Desde"
              value={desde}
              onChange={(e) => setDesde(e.target.value)}
            />
            <Input
              type="date"
              aria-label="Hasta"
              value={hasta}
              onChange={(e) => setHasta(e.target.value)}
            />
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
