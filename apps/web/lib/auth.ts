"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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

  useEffect(() => {
    authAPI.me()
      .then((res) => {
        const u = res.data as MeResponse;

        if (requiredRole === "admin" && u.role.toUpperCase() !== "ADMIN") {
          router.replace("/dashboard");
          return;
        }

        setUser(toStoreUser(u));
        setReady(true);
      })
      .catch(() => {
        router.replace("/login");
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { user, ready };
}
