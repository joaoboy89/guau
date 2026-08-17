"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { authAPI } from "@/lib/api";
import { useAuth } from "@/lib/store";
import { Logo } from "@/components/Logo";
import { Button, Input, Container } from "@/components/ui";

const schema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(1, "Ingresá tu contraseña"),
});

type FormData = z.infer<typeof schema>;

export default function LoginPage() {
  const router = useRouter();
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
      const u = res.data as {
        id: string;
        email: string;
        firstName: string;
        lastName: string;
        role: string;
      };
      const role = u.role.toUpperCase();

      setUser({
        id: u.id,
        email: u.email,
        name: `${u.firstName} ${u.lastName}`,
        role: role === "OWNER" ? "owner" : role === "WALKER" ? "walker" : "admin",
      });

      if (role === "ADMIN") router.push("/admin");
      else if (role === "WALKER") router.push("/walker/dashboard");
      else router.push("/dashboard");
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 401) {
        setServerError("Email o contraseña incorrectos.");
      } else if (status === 403) {
        setServerError("Verificá tu email antes de ingresar. Revisá tu casilla de correo.");
      } else if (status === 429) {
        // El peor consejo posible acá sería "intentá de nuevo": un usuario
        // bloqueado por el throttler que hace caso extiende su propio
        // bloqueo. El mensaje tiene que decirle que espere, no que reintente.
        setServerError("Demasiados intentos. Esperá un minuto y probá de nuevo.");
      } else if (!status) {
        // status undefined = la request no llegó a destino (sin respuesta
        // que leer): caída de red, CORS, Cloudflare Access, lo que sea.
        // Es un problema distinto de "el servidor dijo que no" y necesita
        // su propio mensaje — decirle a alguien sin conexión "ocurrió un
        // error" no le dice nada que pueda accionar.
        setServerError("No pudimos conectarnos. Revisá tu conexión e intentá de nuevo.");
      } else {
        setServerError("Ocurrió un error. Intentá de nuevo.");
      }
    }
  };

  return (
    <main className="min-h-dvh flex flex-col items-center justify-center bg-brand-bg py-10">
      <Container width="form" className="flex max-w-sm flex-col gap-6">
        <div className="flex flex-col items-center gap-3">
          <Logo size={48} />
          <div className="text-center">
            <h1 className="font-serif text-2xl font-bold text-brand-text">
              Ingresar a Güau
            </h1>
            <p className="mt-1 text-sm text-brand-text-muted">
              ¿No tenés cuenta?{" "}
              {/* `Link` en vez de `<a>`: navegación del lado del cliente,
                  sin recargar toda la app para cambiar de pantalla. */}
              <Link href="/register" className="text-brand-primary underline">
                Registrate
              </Link>
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <Input
            {...register("email")}
            label="Email"
            type="email"
            autoComplete="email"
            placeholder="juan@email.com"
            error={errors.email?.message}
          />

          <Input
            {...register("password")}
            label="Contraseña"
            type="password"
            autoComplete="current-password"
            placeholder="••••••••"
            error={errors.password?.message}
          />

          {serverError && (
            <p
              role="alert"
              className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
            >
              {serverError}
            </p>
          )}

          <Button type="submit" loading={isSubmitting} fullWidth>
            {isSubmitting ? "Ingresando…" : "Ingresar"}
          </Button>
        </form>
      </Container>
    </main>
  );
}
