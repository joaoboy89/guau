"use client";

import { useState } from "react";
import { shortWalkId } from "@/lib/walk-id";
import { cn } from "@/lib/cn";

// Dato de soporte, no informacion principal del paseo (docs/diseños/modulo-
// soporte.md §4): discreto a propósito, para no competir con el nombre del
// perro ni con la hora. Con etiqueta — un código suelto no se entiende — y
// en fuente monoespaciada para que no se confundan 0/O ni 1/l al leerlo.
// Botón de copiar reutilizando lo que ya hay (navigator.clipboard, mismo
// patrón que el código de retiro en walks/[id]/page.tsx): sin sumar
// dependencias nuevas, y si el portapapeles falla el código ya es
// seleccionable a simple vista.
export function WalkIdBadge({ id, className }: { id: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const short = shortWalkId(id);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(short);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Sin permiso de portapapeles o navegador viejo: el código ya está
      // seleccionable a simple vista, no hace falta un mensaje de error acá.
    }
  };

  return (
    <p className={cn("text-xs text-brand-text-muted", className)}>
      Código de paseo:{" "}
      <span className="font-mono select-all text-brand-text-body">{short}</span>{" "}
      <button
        type="button"
        onClick={handleCopy}
        className="font-semibold text-brand-primary underline"
      >
        {copied ? "copiado" : "copiar"}
      </button>
      {" "}— dalo si escribís a soporte
    </p>
  );
}
