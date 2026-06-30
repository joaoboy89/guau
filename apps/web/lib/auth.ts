"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth as useAuthStore, useStore } from "./store";
import { authAPI } from "./api";

export function decodeJwtPayload(token: string): Record<string, unknown> {
  try {
    const base64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(base64));
  } catch {
    return {};
  }
}

export function useLogout() {
  const { logout } = useAuthStore();
  const router = useRouter();

  return async () => {
    try {
      await authAPI.logout();
    } catch {
      // Siempre limpiar estado local aunque el API falle
    }
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    logout();
    router.push("/login");
  };
}

export function useRequireAuth(requiredRole?: "admin") {
  const { user, isLoggedIn } = useAuthStore();
  const router = useRouter();

  // Inicializar con el estado actual de hidratación (ya fue si el componente
  // monta después de que persist terminó, e.g. navegación client-side).
  const [hydrated, setHydrated] = useState(() => useStore.persist.hasHydrated());
  const [ready, setReady]       = useState(false);

  // Suscribirse a la hidratación de persist; se dispara solo en recarga (F5).
  useEffect(() => {
    if (hydrated) return;
    return useStore.persist.onFinishHydration(() => setHydrated(true));
  }, [hydrated]);

  useEffect(() => {
    if (!hydrated) return; // Esperar: aún no se leyó el localStorage
    if (!isLoggedIn) {
      router.replace("/login");
      return;
    }
    if (requiredRole === "admin" && user?.role !== "admin") {
      router.replace("/dashboard");
      return;
    }
    setReady(true);
  }, [hydrated, isLoggedIn, user, router, requiredRole]);

  return { user, ready };
}
