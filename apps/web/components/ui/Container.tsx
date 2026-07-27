import { HTMLAttributes, ElementType } from "react";
import { cn } from "@/lib/cn";

type Width = "form" | "content" | "wide" | "full";

interface ContainerProps extends HTMLAttributes<HTMLElement> {
  /**
   * Ancho canónico del contenido. Antes cada página elegía su propio
   * `max-w-*` a ojo (había 3 valores distintos repartidos en 13 lugares),
   * así que dos pantallas del mismo tipo no coincidían.
   *
   * form    — formularios de una columna (login, registro, alta de paseo)
   * content — listados y detalle (mis paseos, dashboards)
   * wide    — landing y páginas de marketing, que respiran más
   * full    — sin límite; para secciones que manejan su propio ancho
   */
  width?: Width;
  as?: ElementType;
}

const widths: Record<Width, string> = {
  form:    "max-w-md",
  content: "max-w-3xl",
  wide:    "max-w-6xl",
  full:    "max-w-none",
};

export default function Container({
  width = "content",
  as: Tag = "div",
  className,
  children,
  ...props
}: ContainerProps) {
  return (
    <Tag
      className={cn("w-full mx-auto px-4 sm:px-6", widths[width], className)}
      {...props}
    >
      {children}
    </Tag>
  );
}
