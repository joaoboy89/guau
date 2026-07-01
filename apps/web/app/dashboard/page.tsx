"use client";

import Link from "next/link";
import { useRequireAuth, useLogout } from "@/lib/auth";
import { Logo } from "@/components/Logo";

export default function DashboardPage() {
  const { user, ready } = useRequireAuth();
  const logout = useLogout();

  if (!ready) return null;

  return (
    <main className="min-h-dvh p-6 flex flex-col gap-6 bg-brand-bg">
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

      <Link
        href="/walks/new"
        className="h-12 flex items-center justify-center rounded-2xl bg-brand-primary text-white font-semibold text-sm hover:opacity-90 transition-opacity shadow-float"
      >
        Reservar paseo
      </Link>

      <Link
        href="/walks"
        className="h-12 flex items-center justify-center rounded-2xl border border-brand-border bg-brand-surface text-brand-text-body font-semibold text-sm hover:shadow-card transition-shadow"
      >
        Mis paseos
      </Link>
    </main>
  );
}
