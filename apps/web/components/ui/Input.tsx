import { forwardRef, InputHTMLAttributes, ReactNode, useId } from "react";
import { cn } from "@/lib/cn";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
}

const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, hint, leftIcon, rightIcon, className, id, ...props },
  ref
) {
  /**
   * `useId` en vez de derivar el id del texto del label: dos inputs con el
   * mismo label (por ejemplo "Dirección" en dos secciones de la misma
   * pantalla) generaban el mismo id, y el `htmlFor` del segundo terminaba
   * enfocando al primero al hacer click.
   */
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const describedBy = error
    ? `${inputId}-error`
    : hint
      ? `${inputId}-hint`
      : undefined;

  return (
    <div className="flex flex-col gap-1.5 w-full">
      {label && (
        <label htmlFor={inputId} className="text-sm font-medium text-brand-text">
          {label}
        </label>
      )}

      <div className="relative flex items-center">
        {leftIcon && (
          <span className="absolute left-3 text-brand-text-muted pointer-events-none">
            {leftIcon}
          </span>
        )}

        <input
          ref={ref}
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn(
            "w-full h-12 rounded-2xl px-4 border bg-brand-surface",
            "text-brand-text placeholder:text-brand-text-muted",
            "transition-colors duration-150",
            "focus:outline-none focus:ring-2 focus:border-transparent",
            "disabled:opacity-60 disabled:cursor-not-allowed",
            error
              ? "border-red-500 focus:ring-red-500"
              : "border-brand-border hover:border-brand-text-muted focus:ring-brand-primary",
            leftIcon && "pl-10",
            rightIcon && "pr-10",
            className
          )}
          {...props}
        />

        {rightIcon && (
          <span className="absolute right-3 text-brand-text-muted">
            {rightIcon}
          </span>
        )}
      </div>

      {error && (
        <p id={`${inputId}-error`} className="text-xs text-red-600">
          {error}
        </p>
      )}
      {hint && !error && (
        <p id={`${inputId}-hint`} className="text-xs text-brand-text-muted">
          {hint}
        </p>
      )}
    </div>
  );
});

export default Input;
