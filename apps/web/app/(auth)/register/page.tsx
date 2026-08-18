"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { authAPI } from "@/lib/api";
import { Logo } from "@/components/Logo";

// ─── Schema ───────────────────────────────────────────────────────────────────

const schema = z
  .object({
    email:           z.string().email("Email inválido"),
    password:        z.string().min(8, "Mínimo 8 caracteres"),
    confirmPassword: z.string(),
    firstName:       z.string().min(1, "Requerido"),
    lastName:        z.string().min(1, "Requerido"),
    phone:           z.string().optional(),
    bio:             z.string().optional(),
    terms:           z.boolean().refine((v) => v === true, {
      message: "Debés aceptar los términos",
    }),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Las contraseñas no coinciden",
    path:    ["confirmPassword"],
  });

type FormData = z.infer<typeof schema>;

const inputCls = (hasError: boolean) =>
  `h-12 px-4 rounded-2xl border ${
    hasError ? "border-red-400" : "border-brand-border"
  } bg-brand-surface text-brand-text text-sm outline-none focus:ring-2 focus:ring-brand-primary/30 transition w-full`;

const textareaCls =
  "px-4 py-3 rounded-2xl border border-brand-border bg-brand-surface text-brand-text text-sm outline-none focus:ring-2 focus:ring-brand-primary/30 resize-none transition w-full";

// ─── Success screen ───────────────────────────────────────────────────────────

function SuccessScreen({ email }: { email: string }) {
  return (
    <main className="min-h-dvh flex flex-col items-center justify-center px-6 text-center gap-6 bg-brand-bg">
      <div className="w-16 h-16 rounded-3xl flex items-center justify-center text-3xl bg-brand-primary-soft">
        ✉️
      </div>
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-serif font-bold text-brand-text">Revisá tu email</h1>
        <p className="text-sm max-w-xs text-brand-text-muted">
          Enviamos un enlace de verificación a{" "}
          <span className="font-semibold text-brand-text-body">{email}</span>.
          Hacé clic en el enlace para activar tu cuenta.
        </p>
        <p className="text-xs max-w-xs text-brand-text-muted">
          ¿No lo encontrás? Revisá tu carpeta de spam o correo no deseado.
        </p>
      </div>
      <a href="/login" className="text-sm underline text-brand-primary">
        Ya verifiqué → Ingresar
      </a>
    </main>
  );
}

// ─── Form ─────────────────────────────────────────────────────────────────────

type Role = "owner" | "walker";

function RegisterForm() {
  const searchParams = useSearchParams();

  const [role, setRole]               = useState<Role>(
    searchParams.get("role") === "walker" ? "walker" : "owner"
  );
  const [success, setSuccess]         = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  const isWalker = role === "walker";

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver:      zodResolver(schema),
    defaultValues: { terms: false },
  });

  const onSubmit = async (data: FormData) => {
    setServerError(null);
    try {
      const payload = {
        email:     data.email,
        password:  data.password,
        firstName: data.firstName,
        lastName:  data.lastName,
        ...(data.phone ? { phone: data.phone } : {}),
        ...(isWalker && data.bio ? { bio: data.bio } : {}),
      };

      if (isWalker) {
        await authAPI.registerWalker(payload);
      } else {
        await authAPI.registerOwner(payload);
      }

      setSuccess(data.email);
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 409) {
        setServerError("Ese email ya está registrado. ¿Querés ingresar?");
      } else if (status === 429) {
        // Mismo criterio que login: "intentá de nuevo" es el peor consejo
        // para alguien bloqueado por el throttler — extiende su propio
        // bloqueo en vez de esperarlo.
        setServerError("Demasiados intentos. Esperá un minuto y probá de nuevo.");
      } else if (!status) {
        // status undefined = la request no llegó a destino, sin respuesta
        // que leer — problema distinto de "el servidor dijo que no" (ver
        // login/page.tsx, mismo patrón).
        setServerError("No pudimos conectarnos. Revisá tu conexión e intentá de nuevo.");
      } else {
        setServerError("Ocurrió un error. Intentá de nuevo.");
      }
    }
  };

  if (success) return <SuccessScreen email={success} />;

  return (
    <main className="min-h-dvh flex flex-col items-center justify-center px-6 py-12 bg-brand-bg">
      <div className="w-full max-w-sm flex flex-col gap-6">

        <div className="flex flex-col items-center gap-3">
          <Logo size={48} />
          <div className="text-center">
            <h1 className="text-2xl font-serif font-bold text-brand-text">
              {isWalker ? "Ser paseador en Güau" : "Crear cuenta en Güau"}
            </h1>
            <p className="text-sm mt-1 text-brand-text-muted">
              ¿Ya tenés cuenta?{" "}
              <a href="/login" className="text-brand-primary underline">
                Ingresá
              </a>
            </p>
          </div>
        </div>

        {/* Selector de rol */}
        <div
          role="tablist"
          aria-label="Tipo de cuenta"
          className="flex w-full rounded-2xl border border-brand-border bg-brand-surface p-1"
        >
          <button
            type="button"
            role="tab"
            aria-selected={!isWalker}
            onClick={() => setRole("owner")}
            className={`flex-1 h-11 rounded-xl text-sm font-semibold transition ${
              !isWalker
                ? "bg-brand-primary text-white"
                : "text-brand-text-muted hover:text-brand-text-body"
            }`}
          >
            Dueño
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={isWalker}
            onClick={() => setRole("walker")}
            className={`flex-1 h-11 rounded-xl text-sm font-semibold transition ${
              isWalker
                ? "bg-brand-primary text-white"
                : "text-brand-text-muted hover:text-brand-text-body"
            }`}
          >
            Paseador
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">

          {/* Nombre + Apellido */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-brand-text-body">Nombre</label>
              <input
                {...register("firstName")}
                type="text"
                placeholder="Juan"
                className={inputCls(!!errors.firstName)}
              />
              {errors.firstName && (
                <span className="text-xs text-red-600">{errors.firstName.message}</span>
              )}
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-brand-text-body">Apellido</label>
              <input
                {...register("lastName")}
                type="text"
                placeholder="García"
                className={inputCls(!!errors.lastName)}
              />
              {errors.lastName && (
                <span className="text-xs text-red-600">{errors.lastName.message}</span>
              )}
            </div>
          </div>

          {/* Email */}
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-brand-text-body">Email</label>
            <input
              {...register("email")}
              type="email"
              autoComplete="email"
              placeholder="juan@email.com"
              className={inputCls(!!errors.email)}
            />
            {errors.email && (
              <span className="text-xs text-red-600">{errors.email.message}</span>
            )}
          </div>

          {/* Teléfono */}
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-brand-text-body">
              Teléfono <span className="text-brand-text-muted">(opcional)</span>
            </label>
            <input
              {...register("phone")}
              type="tel"
              placeholder="+5491122334455"
              className={inputCls(false)}
            />
          </div>

          {/* Bio — solo walker */}
          {isWalker && (
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-brand-text-body">
                Bio <span className="text-brand-text-muted">(opcional)</span>
              </label>
              <textarea
                {...register("bio")}
                rows={3}
                placeholder="Contanos tu experiencia con perros…"
                className={textareaCls}
              />
            </div>
          )}

          {/* Password */}
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-brand-text-body">Contraseña</label>
            <input
              {...register("password")}
              type="password"
              autoComplete="new-password"
              placeholder="Mínimo 8 caracteres"
              className={inputCls(!!errors.password)}
            />
            {errors.password && (
              <span className="text-xs text-red-600">{errors.password.message}</span>
            )}
          </div>

          {/* Confirm password */}
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-brand-text-body">Repetir contraseña</label>
            <input
              {...register("confirmPassword")}
              type="password"
              autoComplete="new-password"
              placeholder="••••••••"
              className={inputCls(!!errors.confirmPassword)}
            />
            {errors.confirmPassword && (
              <span className="text-xs text-red-600">{errors.confirmPassword.message}</span>
            )}
          </div>

          {/* Términos */}
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              {...register("terms")}
              type="checkbox"
              className="mt-0.5 h-4 w-4 rounded accent-brand-primary"
            />
            <span className="text-sm text-brand-text-muted">
              Acepto los{" "}
              <span className="text-brand-primary underline cursor-pointer">
                términos y condiciones
              </span>
            </span>
          </label>
          {errors.terms && (
            <span className="text-xs -mt-2 text-red-600">{errors.terms.message}</span>
          )}

          {/* Server error */}
          {serverError && (
            <div className="text-sm px-4 py-3 rounded-xl bg-red-50 text-red-700 border border-red-200">
              {serverError}{" "}
              {serverError.includes("registrado") && (
                <a href="/login" className="underline font-semibold">Ingresar</a>
              )}
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="h-12 rounded-2xl font-semibold text-white bg-brand-primary transition-opacity disabled:opacity-50"
          >
            {isSubmitting ? "Registrando…" : isWalker ? "Crear cuenta de paseador" : "Crear cuenta"}
          </button>

        </form>
      </div>
    </main>
  );
}

// ─── Page (Suspense requerido por useSearchParams en Next.js 14) ──────────────

export default function RegisterPage() {
  return (
    <Suspense>
      <RegisterForm />
    </Suspense>
  );
}
