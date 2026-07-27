import Image from "next/image";
import { cn } from "@/lib/cn";

interface PhotoSlotProps {
  /**
   * Ruta dentro de `public/`. Mientras sea `null`, se dibuja un placeholder
   * con las medidas exactas que necesita esa foto — así el layout ya ocupa
   * su espacio final y no se mueve nada el día que entre la imagen real.
   *
   * Para activar una foto: dejarla en `public/landing/` y poner acá su ruta.
   */
  src?: string | null;
  alt: string;
  width: number;
  height: number;
  /** Qué debería mostrar la foto. Solo se ve en el placeholder. */
  nota?: string;
  priority?: boolean;
  className?: string;
  imgClassName?: string;
}

export default function PhotoSlot({
  src = null,
  alt,
  width,
  height,
  nota,
  priority = false,
  className,
  imgClassName,
}: PhotoSlotProps) {
  if (src) {
    return (
      <Image
        src={src}
        alt={alt}
        width={width}
        height={height}
        priority={priority}
        sizes="(max-width: 768px) 100vw, 50vw"
        className={cn("object-cover w-full h-full", imgClassName, className)}
      />
    );
  }

  return (
    <div
      role="img"
      aria-label={alt}
      style={{ aspectRatio: `${width} / ${height}` }}
      className={cn(
        "w-full flex flex-col items-center justify-center gap-1 p-4 text-center",
        "bg-brand-surface-sand border border-dashed border-brand-border",
        "text-brand-text-muted select-none",
        className
      )}
    >
      <span className="font-mono text-xs font-semibold">
        {width}×{height}
      </span>
      {nota && <span className="text-xs max-w-[22ch] leading-snug">{nota}</span>}
    </div>
  );
}
