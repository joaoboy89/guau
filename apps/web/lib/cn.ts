import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Une clases de Tailwind resolviendo conflictos.
 *
 * clsx arma el string (y descarta los falsy: undefined, false, null).
 * twMerge desempata cuando dos clases pelean por la misma propiedad,
 * quedándose con la última — que es la que viene por `className` desde afuera.
 *
 *   cn("px-4 bg-brand-primary", "bg-brand-green")  →  "px-4 bg-brand-green"
 *
 * Sin twMerge las dos sobrevivirían en el atributo y el resultado dependería
 * del orden en que Tailwind las emitió en el CSS, no del orden en que se
 * pasaron. Por eso todo primitivo acepta `className` y lo pasa último: hace
 * que sobreescribir un estilo puntual desde la página sea predecible.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
