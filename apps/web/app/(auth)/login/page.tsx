"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { authAPI } from "@/lib/api";
import { useAuth } from "@/lib/store";
import { Logo } from "@/components/Logo";

const schema = z.object({
  email:    z.string().email("Email inválido"),
  password: z.string().min(1, "Ingresá tu contraseña"),
});

type FormData = z.infer<typeof schema>;

const inputCls = (hasError: boolean) =>
  `h-12 px-4 rounded-2xl border ${
    hasError ? "border-red-400" : "border-brand-border"
  } bg-brand-surface text-brand-text text-sm outline-none focus:ring-2 focus:ring-brand-primary/30 transition w-full`;

export default function LoginPage() {
  const router      = useRouter();
  const { setUser } = useAuth();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const onSubmit = async (data: FormData) => {
    setServerError(null);
    try {
      const res = await authAPI.loginOwner(data);
      const u   = res.data as {
        id: string; email: string; firstName: string; lastName: string; role: string;
      };
      const role = u.role.toUpperCase();

      setUser({
        id:    u.id,
        email: u.email,
        name:  `${u.firstName} ${u.lastName}`,
        role:  role === "OWNER" ? "owner" : role === "WALKER" ? "walker" : "admin",
      });

      if (role === "ADMIN")        router.push("/admin");
      else if (role === "WALKER") router.push("/walker/dashboard");
      else                        router.push("/dashboard");
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 401) {
        setServerError("Email o contraseña incorrectos.");
      } else if (status === 403) {
        setServerError("Verificá tu email antes de ingresar. Revisá tu casilla de correo.");
      } else {
        setServerError("Ocurrió un error. Intentá de nuevo.");
      }
    }
  };

  return (
    <main className="min-h-dvh flex flex-col items-center justify-center px-6 bg-brand-bg">
      <div className="w-full max-w-sm flex flex-col gap-6">

        <div className="flex flex-col items-center gap-3">
          <Logo size={48} />
          <div className="text-center">
            <h1 className="text-2xl font-serif font-bold text-brand-text">Ingresar a Güau</h1>
            <p className="text-sm mt-1 text-brand-text-muted">
              ¿No tenés cuenta?{" "}
              <a href="/register" className="text-brand-primary underline">
                Registrate
              </a>
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">

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

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-brand-text-body">Contraseña</label>
            <input
              {...register("password")}
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              className={inputCls(!!errors.password)}
            />
            {errors.password && (
              <span className="text-xs text-red-600">{errors.password.message}</span>
            )}
          </div>

          {serverError && (
            <div className="text-sm px-4 py-3 rounded-xl bg-red-50 text-red-700 border border-red-200">
              {serverError}
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="h-12 rounded-2xl font-semibold text-white bg-brand-primary transition-opacity disabled:opacity-50"
          >
            {isSubmitting ? "Ingresando…" : "Ingresar"}
          </button>

        </form>
      </div>
    </main>
  );
}
