import { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

type Padding = "none" | "sm" | "md" | "lg";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  padding?: Padding;
  /** Realce al pasar el mouse. Usar solo si la card entera es clickeable. */
  interactive?: boolean;
}

const paddings: Record<Padding, string> = {
  none: "",
  sm: "p-3",
  md: "p-4",
  lg: "p-6",
};

export default function Card({
  children,
  padding = "md",
  interactive = false,
  className,
  ...props
}: CardProps) {
  return (
    <div
      className={cn(
        "bg-brand-surface border border-brand-border rounded-2xl shadow-card",
        paddings[padding],
        interactive &&
          "cursor-pointer transition-all duration-200 hover:border-brand-primary hover:shadow-float",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
