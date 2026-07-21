"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRequireAuth } from "@/lib/auth";
import { walksAPI } from "@/lib/api";
import { STATUS_LABEL } from "@/lib/walk-status";

interface Walk {
  id: string;
  status: string;
  scheduledAt: string;
  walkType: { label: string };
  walker: { user: { firstName: string; lastName: string } };
}

export default function WalksPage() {
  const { ready } = useRequireAuth();
  const [walks, setWalks] = useState<Walk[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ready) return;
    walksAPI.list()
      .then((res) => setWalks(res.data))
      .finally(() => setLoading(false));
  }, [ready]);

  if (!ready || loading) return null;

  return (
    <main className="flex-1 p-6 flex flex-col gap-6 max-w-lg mx-auto w-full">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-serif font-bold text-brand-text">Mis paseos</h1>
        <Link
          href="/walks/new"
          className="text-sm px-4 py-2 rounded-xl bg-brand-primary text-white font-semibold hover:opacity-90 transition-opacity"
        >
          Reservar
        </Link>
      </header>

      {walks.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 rounded-3xl border border-dashed border-brand-border min-h-60">
          <p className="text-sm text-brand-text-muted">Todavía no reservaste ningún paseo.</p>
          <Link
            href="/walks/new"
            className="px-6 py-2.5 rounded-2xl bg-brand-primary text-white text-sm font-semibold hover:opacity-90 transition-opacity"
          >
            Reservar un paseo
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {walks.map((walk) => {
            const dateStr = new Date(walk.scheduledAt).toLocaleString("es-AR", {
              dateStyle: "long",
              timeStyle: "short",
            });
            const walkerName = `${walk.walker.user.firstName} ${walk.walker.user.lastName}`;
            return (
              <Link
                key={walk.id}
                href={`/walks/${walk.id}`}
                className="bg-brand-surface rounded-2xl p-4 shadow-card border border-brand-border flex flex-col gap-2 hover:shadow-float transition-shadow"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-sm font-semibold text-brand-text-body">
                    {walk.walkType.label}
                  </span>
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-brand-primary-soft text-brand-primary shrink-0">
                    {STATUS_LABEL[walk.status] ?? walk.status}
                  </span>
                </div>
                <p className="text-xs text-brand-text-muted">{dateStr}</p>
                <p className="text-xs text-brand-text-muted">Paseador: {walkerName}</p>
              </Link>
            );
          })}
        </div>
      )}
    </main>
  );
}
