import Image from "next/image";
import { clsx } from "clsx";

type AvatarSize = "xs" | "sm" | "md" | "lg" | "xl";

interface AvatarProps {
  src?:       string | null;
  name?:      string;
  size?:      AvatarSize;
  className?: string;
}

const sizes: Record<AvatarSize, { container: string; text: string; px: number }> = {
  xs: { container: "w-7 h-7",   text: "text-xs",   px: 28 },
  sm: { container: "w-9 h-9",   text: "text-sm",   px: 36 },
  md: { container: "w-12 h-12", text: "text-base",  px: 48 },
  lg: { container: "w-16 h-16", text: "text-xl",   px: 64 },
  xl: { container: "w-24 h-24", text: "text-3xl",  px: 96 },
};

function getInitials(name?: string): string {
  if (!name) return "?";
  const parts = name.trim().split(" ");
  return parts.length >= 2
    ? `${parts[0][0]}${parts[1][0]}`.toUpperCase()
    : parts[0][0].toUpperCase();
}

export default function Avatar({ src, name, size = "md", className }: AvatarProps) {
  const { container, text, px } = sizes[size];

  return (
    <div
      className={clsx(
        "relative rounded-full overflow-hidden flex items-center justify-center shrink-0",
        "gradient-accent text-white font-bold select-none",
        container,
        className
      )}
    >
      {src ? (
        <Image
          src={src}
          alt={name || "avatar"}
          width={px}
          height={px}
          className="object-cover w-full h-full"
        />
      ) : (
        <span className={text}>{getInitials(name)}</span>
      )}
    </div>
  );
}
