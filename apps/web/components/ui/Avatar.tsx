import Image from "next/image";
import { cn } from "@/lib/cn";

type AvatarSize = "xs" | "sm" | "md" | "lg" | "xl";

interface AvatarProps {
  src?: string | null;
  name?: string;
  size?: AvatarSize;
  className?: string;
}

const sizes: Record<AvatarSize, { box: string; text: string; px: number }> = {
  xs: { box: "w-7 h-7",   text: "text-xs",  px: 28 },
  sm: { box: "w-9 h-9",   text: "text-sm",  px: 36 },
  md: { box: "w-12 h-12", text: "text-base", px: 48 },
  lg: { box: "w-16 h-16", text: "text-xl",  px: 64 },
  xl: { box: "w-24 h-24", text: "text-3xl", px: 96 },
};

/**
 * Toma las iniciales por code point (`[...]`), no por índice de string.
 * `"Ñuñez"[0]` funciona, pero un nombre que arranque con un emoji o un
 * carácter fuera del plano básico se parte al medio y renderiza basura.
 */
function getInitials(name?: string): string {
  const clean = name?.trim();
  if (!clean) return "?";
  const parts = clean.split(/\s+/);
  const first = [...parts[0]][0] ?? "";
  const second = parts.length >= 2 ? ([...parts[1]][0] ?? "") : "";
  return (first + second).toUpperCase();
}

export default function Avatar({
  src,
  name,
  size = "md",
  className,
}: AvatarProps) {
  const { box, text, px } = sizes[size];

  return (
    <div
      className={cn(
        "relative rounded-full overflow-hidden shrink-0",
        "flex items-center justify-center select-none",
        // `gradient-accent` no existe; la utilidad real de globals.css
        // es `gradient-primary` (terracota → arena).
        "gradient-primary text-white font-bold",
        box,
        className
      )}
    >
      {src ? (
        <Image
          src={src}
          alt={name ? `Foto de ${name}` : "Foto de perfil"}
          width={px}
          height={px}
          className="object-cover w-full h-full"
        />
      ) : (
        <span className={text} aria-hidden="true">
          {getInitials(name)}
        </span>
      )}
    </div>
  );
}
