import { ReactNode } from "react";
import { cn } from "@/lib/cn";

type BadgeVariant = "success" | "warning" | "error" | "info" | "default";

interface BadgeProps {
  variant?: BadgeVariant;
  children: ReactNode;
  dot?: boolean;
  className?: string;
}

/**
 * Las variantes anteriores eran del tema oscuro (`bg-teal-900/50`,
 * `text-teal-300`) — invisibles sobre el crema del tema actual.
 *
 * `success` usa el verde de marca, que en Güau no es "ok" genérico sino
 * confianza/verificación: el mismo verde del badge de paseador verificado.
 */
const variants: Record<BadgeVariant, string> = {
  success: "bg-brand-green-soft  text-brand-green   border-brand-green/20",
  warning: "bg-amber-50          text-amber-800     border-amber-200",
  error:   "bg-red-50            text-red-700       border-red-200",
  info:    "bg-brand-primary-soft text-brand-primary border-brand-primary/20",
  default: "bg-brand-surface-sand text-brand-text-muted border-brand-border",
};

const dots: Record<BadgeVariant, string> = {
  success: "bg-brand-green",
  warning: "bg-amber-500",
  error:   "bg-red-500",
  info:    "bg-brand-primary",
  default: "bg-brand-text-muted",
};

export default function Badge({
  variant = "default",
  children,
  dot = false,
  className,
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 border rounded-full",
        "px-2.5 py-0.5 text-xs font-semibold",
        variants[variant],
        className
      )}
    >
      {dot && (
        <span
          aria-hidden="true"
          className={cn("w-1.5 h-1.5 rounded-full shrink-0", dots[variant])}
        />
      )}
      {children}
    </span>
  );
}
