"use client";

import { useRequireAuth, useLogout } from "@/lib/auth";

export default function DashboardPage() {
  const { user, ready } = useRequireAuth();
  const logout = useLogout();

  if (!ready) return null;

  return (
    <main className="min-h-dvh p-6 flex flex-col gap-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Dashboard</h1>
          <p className="text-sm mt-0.5" style={{ color: "#8888aa" }}>
            Hola, {user?.name || user?.email} · {user?.role}
          </p>
        </div>
        <button
          onClick={logout}
          className="text-sm px-4 py-2 rounded-xl border transition-opacity hover:opacity-70"
          style={{ borderColor: "#2e2e4a", color: "#8888aa" }}
        >
          Salir
        </button>
      </header>

      <div
        className="flex-1 flex items-center justify-center rounded-3xl"
        style={{ border: "1px dashed #2e2e4a" }}
      >
        <p className="text-sm" style={{ color: "#8888aa" }}>
          Contenido del dashboard — próxima sesión
        </p>
      </div>
    </main>
  );
}
