"use client";

import { useEffect } from "react";
import { useStore } from "@/lib/store";
import { decodeJwtPayload } from "@/lib/auth";

export function AuthHydrator() {
  const { user, isLoggedIn, setUser, logout } = useStore();

  useEffect(() => {
    const token = localStorage.getItem("access_token");

    // Token ausente pero store dice logueado → sesión inválida, limpiar
    if (!token && isLoggedIn) {
      logout();
      return;
    }

    // Token presente pero store vacío → rehidratar (Zustand perdió estado)
    if (token && !user) {
      const payload = decodeJwtPayload(token);
      if (!payload.sub) {
        localStorage.removeItem("access_token");
        localStorage.removeItem("refresh_token");
        return;
      }
      const role = ((payload.role as string) ?? "").toUpperCase();
      setUser({
        id:    payload.sub as string,
        email: payload.email as string,
        name:  "",
        role:  role === "OWNER" ? "owner" : role === "WALKER" ? "walker" : "admin",
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
