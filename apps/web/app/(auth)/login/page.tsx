"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { authAPI } from "@/lib/api";
import { useAuth } from "@/lib/store";

const schema = z.object({
  email:    z.string().email("Email inválido"),
  password: z.string().min(1, "Ingresá tu contraseña"),
});

type FormData = z.infer<typeof schema>;

function decodeJwtPayload(token: string): Record<string, unknown> {
  try {
    const base64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(base64));
  } catch {
    return {};
  }
}

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
      const { accessToken, refreshToken } = res.data as { accessToken: string; refreshToken: string };

      localStorage.setItem("access_token",  accessToken);
      localStorage.setItem("refresh_token", refreshToken);

      const payload = decodeJwtPayload(accessToken);
      const role    = (payload.role as string ?? "").toUpperCase();

      setUser({
        id:    payload.sub as string,
        email: payload.email as string,
        name:  "",
        role:  role === "OWNER" ? "owner" : role === "WALKER" ? "walker" : "admin",
      });

      router.push(role === "ADMIN" ? "/admin" : "/dashboard");
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
    <main className="min-h-dvh flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm flex flex-col gap-6">

        <div className="text-center">
          <h1 className="text-2xl font-extrabold tracking-tight">Ingresar a Güau</h1>
          <p className="text-sm mt-1" style={{ color: "#8888aa" }}>
            ¿No tenés cuenta?{" "}
            <a href="/register" style={{ color: "#00a89c" }} className="underline">
              Registrate
            </a>
          </p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium">Email</label>
            <input
              {...register("email")}
              type="email"
              autoComplete="email"
              placeholder="juan@email.com"
              className="h-12 px-4 rounded-2xl border text-sm outline-none focus:ring-2 transition"
              style={{
                background:  "#1a1a2e",
                borderColor: errors.email ? "#f87171" : "#2e2e4a",
                color:       "#f0f0f8",
              }}
            />
            {errors.email && (
              <span className="text-xs" style={{ color: "#f87171" }}>{errors.email.message}</span>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium">Contraseña</label>
            <input
              {...register("password")}
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              className="h-12 px-4 rounded-2xl border text-sm outline-none focus:ring-2 transition"
              style={{
                background:  "#1a1a2e",
                borderColor: errors.password ? "#f87171" : "#2e2e4a",
                color:       "#f0f0f8",
              }}
            />
            {errors.password && (
              <span className="text-xs" style={{ color: "#f87171" }}>{errors.password.message}</span>
            )}
          </div>

          {serverError && (
            <div
              className="text-sm px-4 py-3 rounded-xl"
              style={{ background: "#2a1a1a", color: "#f87171", border: "1px solid #f8717133" }}
            >
              {serverError}
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="h-12 rounded-2xl font-semibold text-white transition-opacity disabled:opacity-50"
            style={{ backgroundColor: "#00a89c" }}
          >
            {isSubmitting ? "Ingresando…" : "Ingresar"}
          </button>

        </form>
      </div>
    </main>
  );
}
