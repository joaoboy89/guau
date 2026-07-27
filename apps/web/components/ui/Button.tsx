import { forwardRef, ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";
import Spinner from "./Spinner";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  fullWidth?: boolean;
}

const variants: Record<Variant, string> = {
  primary:
    "bg-brand-primary text-white shadow-card hover:opacity-90",
  secondary:
    "bg-brand-surface text-brand-text-body border border-brand-border hover:bg-brand-surface-sand",
  ghost:
    "bg-transparent text-brand-primary hover:bg-brand-primary-soft",
  danger:
    "bg-red-600 text-white shadow-card hover:bg-red-700",
};

const sizes: Record<Size, string> = {
  sm: "h-9  px-4 text-sm   rounded-xl  gap-1.5",
  md: "h-12 px-6 text-base rounded-2xl gap-2",
  lg: "h-14 px-8 text-lg   rounded-2xl gap-2",
};

/**
 * Devuelve solo las clases del botón, sin renderizar un `<button>`.
 *
 * Sirve para los casos donde el elemento correcto es un `<Link>` de Next
 * (navegar) pero tiene que verse como botón. Meter un `<button>` adentro de
 * un `<Link>` es HTML inválido, y un `<button onClick={router.push}>` rompe
 * el "abrir en pestaña nueva" y el hover que muestra la URL destino.
 *
 *   <Link href="/register" className={buttonStyles({ size: "lg" })}>
 */
export function buttonStyles({
  variant = "primary",
  size = "md",
  fullWidth = false,
  className,
}: {
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
  className?: string;
} = {}) {
  return cn(
    "inline-flex items-center justify-center font-semibold",
    "transition-opacity duration-150 select-none",
    "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary",
    "focus-visible:ring-offset-2 focus-visible:ring-offset-brand-bg",
    variants[variant],
    sizes[size],
    fullWidth && "w-full",
    className
  );
}

/**
 * Botón base de Güau.
 *
 * `loading` deshabilita el botón además de mostrar el spinner: sin eso, un
 * doble click durante una request en vuelo manda la acción dos veces — en el
 * flujo de reserva serían dos paseos, en el de pago dos preferencias de
 * MercadoPago.
 *
 * El texto sigue visible mientras carga para que el botón no cambie de ancho
 * y no empuje el layout.
 */
const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "primary",
    size = "md",
    loading = false,
    fullWidth = false,
    className,
    disabled,
    children,
    type = "button",
    ...props
  },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        "inline-flex items-center justify-center font-semibold",
        "transition-opacity duration-150 select-none",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary",
        "focus-visible:ring-offset-2 focus-visible:ring-offset-brand-bg",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        variants[variant],
        sizes[size],
        fullWidth && "w-full",
        className
      )}
      {...props}
    >
      {loading && <Spinner size={size === "sm" ? 14 : 18} />}
      {children}
    </button>
  );
});

export default Button;
