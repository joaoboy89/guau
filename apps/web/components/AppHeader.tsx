"use client";

import Link from "next/link";
import { useLogout } from "@/lib/auth";
import { useAuth } from "@/lib/store";
import { Logo } from "./Logo";
import { NotificationsBell } from "./NotificationsBell";

function dashboardHref(role: string | undefined): string {
  if (role === "walker") return "/walker/dashboard";
  if (role === "admin") return "/admin";
  return "/dashboard";
}

export function AppHeader() {
  const { user } = useAuth();
  const logout = useLogout();

  return (
    <header className="flex items-center justify-between px-6 py-4 border-b border-brand-border bg-brand-surface">
      <Link href={dashboardHref(user?.role)} className="flex items-center gap-3">
        <Logo size={32} />
        <span className="text-lg font-serif font-bold text-brand-text">Güau</span>
      </Link>
      <div className="flex items-center gap-2">
        <NotificationsBell />
        <button
          onClick={logout}
          className="text-sm px-4 py-2 rounded-xl border border-brand-border text-brand-text-muted transition-opacity hover:opacity-70"
        >
          Salir
        </button>
      </div>
    </header>
  );
}
