"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AxiosError } from "axios";
import * as Sentry from "@sentry/nextjs";
import { useAuth as useAuthStore } from "./store";
import { authAPI } from "./api";

interface MeResponse {
  id:        string;
  email:     string;
  firstName: string;
  lastName:  string;
  role:      string;
}

function toStoreUser(u: MeResponse) {
  const role = u.role.toUpperCase();
  return {
    id:    u.id,
    email: u.email,
    name:  `${u.firstName} ${u.lastName}`,
    role:  (role === "OWNER" ? "owner" : role === "WALKER" ? "walker" : "admin") as "owner" | "walker" | "admin",
  };
}

// ─── Clasificacion de un fallo de /auth/me — funcion pura, testeable sin
// montar el hook (mismo criterio que buildSearchQuery/getSupportSignals en
// lib/support/) ──────────────────────────────────────────────────────────
//
// Regla 1 de CLAUDE.md ("nunca un catch que se coma todo") aplicada a esta
// pantalla especificamente: /login es la salida correcta SOLO para un 401
// real. Antes, CUALQUIER motivo (throttler, 500, caida de red, un 302 de
// Cloudflare Access) pateaba a /login igual, sin rastro de por que — el
// mismo error que ya se habia corregido en el MENSAJE que se mostraba,
// nunca en el redirect que decide a donde te manda.
export type AuthMeErrorResult =
  | { action: "login" }
  | { action: "show-error"; reason: string; message: string };

export function classifyAuthMeError(err: unknown): AuthMeErrorResult {
  const axiosErr = err as AxiosError;
  const status = axiosErr?.response?.status;

  if (status === 401) {
    // El unico caso correcto: no hay sesion valida.
    return { action: "login" };
  }

  if (status === undefined) {
    // Regla 2 de CLAUDE.md: sin status la request NO LLEGO — no es lo
    // mismo que "no estas logueado". Puede ser la red, un timeout, CORS,
    // o un 302 de Cloudflare Access que el navegador no deja leer como
    // respuesta valida.
    return {
      action: "show-error",
      reason: "no-response",
      message: "No pudimos conectar con el servidor. Revisá tu conexión e intentá de nuevo.",
    };
  }

  // Cualquier otro status (429 del throttler, 500, 503, etc.): tampoco es
  // un 401. Redirigir a /login acá borraria la sesion de alguien que SI
  // esta logueado, por un motivo que no tiene nada que ver.
  return {
    action: "show-error",
    reason: `status-${status}`,
    message: `Ocurrió un error (${status}). No es un problema tuyo — probá de nuevo en un momento.`,
  };
}

export function useLogout() {
  const { logout } = useAuthStore();
  const router = useRouter();

  return async () => {
    try {
      await authAPI.logout();
    } catch {
      // El backend limpia las cookies; limpiamos store pase lo que pase
    }
    logout();
    router.push("/login");
  };
}

export function useRequireAuth(requiredRole?: "admin") {
  const { user, setUser } = useAuthStore();
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    function handleAuthError(err: unknown) {
      if (cancelled) return;
      const result = classifyAuthMeError(err);

      if (result.action === "login") {
        router.replace("/login");
        return;
      }

      console.error(`useRequireAuth: /auth/me fallo (${result.reason}) — no es un 401, no significa que la sesion vencio.`, err);
      Sentry.captureException(err, { tags: { authMeFailure: result.reason } });
      setError(result.message);
    }

    async function load() {
      let res: Awaited<ReturnType<typeof authAPI.me>>;
      try {
        res = await authAPI.me();
      } catch (err) {
        handleAuthError(err);
        return;
      }

      if (cancelled) return;

      // A partir de acá la request de /auth/me funciono — cualquier
      // excepcion desde este punto es un BUG del frontend (ej. un campo
      // inesperado en la respuesta), no una sesion vencida. Antes vivia
      // en el mismo catch que el error de la request de arriba, y las dos
      // cosas se trataban igual: patear a /login.
      try {
        const u = res.data as MeResponse;

        if (requiredRole === "admin" && u.role.toUpperCase() !== "ADMIN") {
          router.replace("/dashboard");
          return;
        }

        setUser(toStoreUser(u));
        setReady(true);
      } catch (err) {
        if (cancelled) return;
        console.error(
          "useRequireAuth: la request de /auth/me funciono pero procesar la respuesta tiro una excepcion — esto es un bug, no una sesion vencida.",
          err,
        );
        Sentry.captureException(err, { tags: { authMeFailure: "response-processing" } });
        setError("Ocurrió un error inesperado. Recargá la página o probá de nuevo en un momento.");
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { user, ready, error };
}
