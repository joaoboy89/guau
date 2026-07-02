"use client";

import { useEffect } from "react";
import { useStore } from "@/lib/store";
import { authAPI } from "@/lib/api";

export function AuthHydrator() {
  const { isLoggedIn, setUser, logout } = useStore();

  useEffect(() => {
    authAPI.me()
      .then((res) => {
        const u = res.data as {
          id: string; email: string; firstName: string; lastName: string; role: string;
        };
        const role = u.role.toUpperCase();
        setUser({
          id:    u.id,
          email: u.email,
          name:  `${u.firstName} ${u.lastName}`,
          role:  role === "OWNER" ? "owner" : role === "WALKER" ? "walker" : "admin",
        });
      })
      .catch(() => {
        if (isLoggedIn) logout();
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
