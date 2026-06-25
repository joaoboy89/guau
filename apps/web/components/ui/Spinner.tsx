import { clsx } from "clsx";

interface SpinnerProps {
  size?:      number;
  className?: string;
}

export default function Spinner({ size = 24, className }: SpinnerProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={clsx("animate-spin text-brand-accent", className)}
      aria-label="Cargando..."
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.2" />
      <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function FullPageSpinner() {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-brand-bg">
      <Spinner size={40} />
    </div>
  );
}
