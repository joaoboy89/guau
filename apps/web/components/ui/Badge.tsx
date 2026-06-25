import { clsx } from "clsx";

type BadgeVariant = "success" | "warning" | "error" | "info" | "default";

interface BadgeProps {
  variant?:   BadgeVariant;
  children:   React.ReactNode;
  dot?:       boolean;
  className?: string;
}

const variants: Record<BadgeVariant, string> = {
  success: "bg-teal-900/50 text-teal-300 border-teal-700/50",
  warning: "bg-yellow-900/50 text-yellow-300 border-yellow-700/50",
  error:   "bg-red-900/50 text-red-300 border-red-700/50",
  info:    "bg-blue-900/50 text-blue-300 border-blue-700/50",
  default: "bg-brand-border text-brand-muted border-brand-border",
};

export default function Badge({ variant = "default", children, dot, className }: BadgeProps) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border",
        variants[variant],
        className
      )}
    >
      {dot && (
        <span
          className={clsx(
            "w-1.5 h-1.5 rounded-full shrink-0",
            variant === "success" && "bg-teal-400",
            variant === "warning" && "bg-yellow-400",
            variant === "error"   && "bg-red-400",
            variant === "info"    && "bg-blue-400",
            variant === "default" && "bg-brand-muted"
          )}
        />
      )}
      {children}
    </span>
  );
}
