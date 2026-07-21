"use client";

import Link from "next/link";
import { useRequireAuth } from "@/lib/auth";

export default function DashboardPage() {
  const { user, ready } = useRequireAuth();

  if (!ready) return null;

  return (
    <main className="flex-1 p-6 flex flex-col gap-6">
      <h1 className="text-xl font-serif font-bold text-brand-text">
        Hola, {user?.name || user?.email}
      </h1>

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
