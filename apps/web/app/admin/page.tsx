"use client";

import { useRequireAuth, useLogout } from "@/lib/auth";

export default function AdminPage() {
  const { user, ready } = useRequireAuth("admin");
  const logout = useLogout();

  if (!ready) return null;

  return (
    <main className="min-h-dvh p-6 flex flex-col gap-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Panel Admin</h1>
          <p className="text-sm mt-0.5" style={{ color: "#8888aa" }}>
            {user?.email}
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
          Panel de administración — próxima sesión
        </p>
      </div>
    </main>
  );
}
