import { cn } from "@/lib/cn";

interface SpinnerProps {
  size?: number;
  className?: string;
}

/**
 * Hereda el color del contexto (`currentColor`), así el mismo spinner sirve
 * dentro de un botón terracota (blanco) y suelto en la página (terracota).
 * Antes tenía el color horneado con una clase que ya no existía.
 */
export default function Spinner({ size = 24, className }: SpinnerProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={cn("animate-spin shrink-0", className)}
      role="status"
      aria-label="Cargando"
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="3"
        strokeOpacity="0.2"
      />
      <path
        d="M12 2a10 10 0 0 1 10 10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function FullPageSpinner() {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-brand-bg text-brand-primary">
      <Spinner size={40} />
    </div>
  );
}
