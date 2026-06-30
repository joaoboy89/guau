"use client";

import { useRequireAuth, useLogout } from "@/lib/auth";
import { Logo } from "@/components/Logo";

export default function DashboardPage() {
  const { user, ready } = useRequireAuth();
  const logout = useLogout();

  if (!ready) return null;

  return (
    <main className="min-h-dvh bg-brand-bg">
      <div className="w-full max-w-md mx-auto px-6 py-6 flex flex-col gap-6 min-h-dvh">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Logo size={36} />
          <div>
            <h1 className="text-xl font-serif font-bold text-brand-text">Güau</h1>
            <p className="text-xs text-brand-text-muted">
              Hola, {user?.name || user?.email}
            </p>
          </div>
        </div>
        <button
          onClick={logout}
          className="text-sm px-4 py-2 rounded-xl border border-brand-border text-brand-text-muted transition-opacity hover:opacity-70"
        >
          Salir
        </button>
      </header>

      <div className="flex-1 flex items-center justify-center rounded-3xl border border-dashed border-brand-border min-h-40">
        <p className="text-sm text-brand-text-muted">
          Contenido del dashboard — próxima sesión
        </p>
      </div>
      </div>
    </main>
  );
}
