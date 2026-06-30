"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth as useAuthStore } from "./store";
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
  const { user } = useAuthStore();
  const router   = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("access_token");

    if (!token) {
      router.replace("/login");
      return;
    }

    if (requiredRole === "admin") {
      const payload = decodeJwtPayload(token);
      const role    = (payload.role as string ?? "").toUpperCase();
      if (role !== "ADMIN") {
        router.replace("/dashboard");
        return;
      }
    }

    setReady(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { user, ready };
}
