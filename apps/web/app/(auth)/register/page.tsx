"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { authAPI } from "@/lib/api";

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

// ─── Success screen ───────────────────────────────────────────────────────────

function SuccessScreen({ email }: { email: string }) {
  return (
    <main className="min-h-dvh flex flex-col items-center justify-center px-6 text-center gap-6">
      <div
        className="w-16 h-16 rounded-3xl flex items-center justify-center text-3xl"
        style={{ background: "linear-gradient(135deg, #00baad 0%, #4dd2c7 100%)" }}
      >
        ✉️
      </div>
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-extrabold tracking-tight">Revisá tu email</h1>
        <p className="text-sm max-w-xs" style={{ color: "#8888aa" }}>
          Enviamos un enlace de verificación a{" "}
          <span className="font-semibold" style={{ color: "#f0f0f8" }}>{email}</span>.
          Hacé clic en el enlace para activar tu cuenta.
        </p>
        <p className="text-xs max-w-xs" style={{ color: "#8888aa" }}>
          ¿No lo encontrás? Revisá tu carpeta de spam o correo no deseado.
        </p>
      </div>
      <a
        href="/login"
        className="text-sm underline"
        style={{ color: "#00a89c" }}
      >
        Ya verifiqué → Ingresar
      </a>
    </main>
  );
}

// ─── Form ─────────────────────────────────────────────────────────────────────

function RegisterForm() {
  const searchParams = useSearchParams();
  const isWalker     = searchParams.get("role") === "walker";

  const [success, setSuccess]       = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

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
      } else {
        setServerError("Ocurrió un error. Intentá de nuevo.");
      }
    }
  };

  if (success) return <SuccessScreen email={success} />;

  const inputStyle = (hasError: boolean) => ({
    background:  "#1a1a2e",
    borderColor: hasError ? "#f87171" : "#2e2e4a",
    color:       "#f0f0f8",
  });

  return (
    <main className="min-h-dvh flex flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm flex flex-col gap-6">

        <div className="text-center">
          <h1 className="text-2xl font-extrabold tracking-tight">
            {isWalker ? "Ser paseador en Güau" : "Crear cuenta en Güau"}
          </h1>
          <p className="text-sm mt-1" style={{ color: "#8888aa" }}>
            ¿Ya tenés cuenta?{" "}
            <a href="/login" style={{ color: "#00a89c" }} className="underline">
              Ingresá
            </a>
          </p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">

          {/* Nombre + Apellido */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium">Nombre</label>
              <input
                {...register("firstName")}
                type="text"
                placeholder="Juan"
                className="h-12 px-4 rounded-2xl border text-sm outline-none"
                style={inputStyle(!!errors.firstName)}
              />
              {errors.firstName && (
                <span className="text-xs" style={{ color: "#f87171" }}>{errors.firstName.message}</span>
              )}
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium">Apellido</label>
              <input
                {...register("lastName")}
                type="text"
                placeholder="García"
                className="h-12 px-4 rounded-2xl border text-sm outline-none"
                style={inputStyle(!!errors.lastName)}
              />
              {errors.lastName && (
                <span className="text-xs" style={{ color: "#f87171" }}>{errors.lastName.message}</span>
              )}
            </div>
          </div>

          {/* Email */}
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium">Email</label>
            <input
              {...register("email")}
              type="email"
              autoComplete="email"
              placeholder="juan@email.com"
              className="h-12 px-4 rounded-2xl border text-sm outline-none"
              style={inputStyle(!!errors.email)}
            />
            {errors.email && (
              <span className="text-xs" style={{ color: "#f87171" }}>{errors.email.message}</span>
            )}
          </div>

          {/* Teléfono */}
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium">
              Teléfono <span style={{ color: "#8888aa" }}>(opcional)</span>
            </label>
            <input
              {...register("phone")}
              type="tel"
              placeholder="+5491122334455"
              className="h-12 px-4 rounded-2xl border text-sm outline-none"
              style={inputStyle(false)}
            />
          </div>

          {/* Bio — solo walker */}
          {isWalker && (
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium">
                Bio <span style={{ color: "#8888aa" }}>(opcional)</span>
              </label>
              <textarea
                {...register("bio")}
                rows={3}
                placeholder="Contanos tu experiencia con perros…"
                className="px-4 py-3 rounded-2xl border text-sm outline-none resize-none"
                style={inputStyle(false)}
              />
            </div>
          )}

          {/* Password */}
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium">Contraseña</label>
            <input
              {...register("password")}
              type="password"
              autoComplete="new-password"
              placeholder="Mínimo 8 caracteres"
              className="h-12 px-4 rounded-2xl border text-sm outline-none"
              style={inputStyle(!!errors.password)}
            />
            {errors.password && (
              <span className="text-xs" style={{ color: "#f87171" }}>{errors.password.message}</span>
            )}
          </div>

          {/* Confirm password */}
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium">Repetir contraseña</label>
            <input
              {...register("confirmPassword")}
              type="password"
              autoComplete="new-password"
              placeholder="••••••••"
              className="h-12 px-4 rounded-2xl border text-sm outline-none"
              style={inputStyle(!!errors.confirmPassword)}
            />
            {errors.confirmPassword && (
              <span className="text-xs" style={{ color: "#f87171" }}>{errors.confirmPassword.message}</span>
            )}
          </div>

          {/* Términos */}
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              {...register("terms")}
              type="checkbox"
              className="mt-0.5 h-4 w-4 rounded accent-teal-500"
            />
            <span className="text-sm" style={{ color: "#8888aa" }}>
              Acepto los{" "}
              <span style={{ color: "#00a89c" }} className="underline cursor-pointer">
                términos y condiciones
              </span>
            </span>
          </label>
          {errors.terms && (
            <span className="text-xs -mt-2" style={{ color: "#f87171" }}>{errors.terms.message}</span>
          )}

          {/* Server error */}
          {serverError && (
            <div
              className="text-sm px-4 py-3 rounded-xl"
              style={{ background: "#2a1a1a", color: "#f87171", border: "1px solid #f8717133" }}
            >
              {serverError}{" "}
              {serverError.includes("registrado") && (
                <a href="/login" style={{ color: "#f87171" }} className="underline font-semibold">
                  Ingresar
                </a>
              )}
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="h-12 rounded-2xl font-semibold text-white transition-opacity disabled:opacity-50"
            style={{ backgroundColor: "#00a89c" }}
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
