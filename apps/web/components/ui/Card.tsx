import { ElementType, HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

type Padding = "none" | "sm" | "md" | "lg";

interface CardProps extends HTMLAttributes<HTMLElement> {
  children: ReactNode;
  padding?: Padding;
  /** Realce al pasar el mouse. Usar solo si la card entera es clickeable. */
  interactive?: boolean;
  /**
   * Elemento nativo a renderizar. `as="button"` para una tarjeta
   * seleccionable: hereda teclado, foco y semántica del botón nativo en vez
   * de tener que parchearlos a mano (role="button" + tabIndex + onKeyDown).
   */
  as?: ElementType;
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
  as: Tag = "div",
  className,
  ...props
}: CardProps) {
  return (
    <Tag
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
    </Tag>
  );
}
