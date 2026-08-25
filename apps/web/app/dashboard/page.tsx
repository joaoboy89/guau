"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRequireAuth } from "@/lib/auth";
import { walksAPI } from "@/lib/api";
import type { PendingQuestion } from "@guau/shared";
import PendingQuestionCard from "@/components/PendingQuestionCard";

export default function DashboardPage() {
  const { user, ready } = useRequireAuth();

  const [pending, setPending] = useState<PendingQuestion[]>([]);
  // walkId -> momento en que se confirmó DESDE esta pantalla, en esta
  // sesión. No se persiste ni se relee del backend: una vez confirmado, el
  // paseo sale de GET /walks/pending-questions y al recargar la pantalla el
  // cartel ya no aparece — esto es solo la leyenda inmediata post-click.
  const [acknowledged, setAcknowledged] = useState<Record<string, Date>>({});

  useEffect(() => {
    if (!ready) return;
    walksAPI
      .pendingQuestions()
      .then((res) => setPending(res.data))
      .catch(() => {
        // Si falla, el dashboard sigue andando con el resto de la app — el
        // peor caso de un bug acá es "no reservo", nunca "no entro".
      });
  }, [ready]);

  if (!ready) return null;

  // Bloquea reservar mientras quede alguna sin responder — ya sea porque
  // GET pending-questions la trajo y todavía no se tocó, o porque se
  // confirmó recién y el estado local todavía no la sacó de `pending`.
  const hasUnresolved = pending.some((pq) => !acknowledged[pq.walkId]);

  return (
    <main className="flex-1 p-6 flex flex-col gap-6">
      <h1 className="text-xl font-serif font-bold text-brand-text">
        Hola, {user?.name || user?.email}
      </h1>

      {pending.map((pq) => (
        <PendingQuestionCard
          key={pq.walkId}
          question={pq}
          acknowledgedAt={acknowledged[pq.walkId] ?? null}
          onAcknowledged={(walkId, acknowledgedAt) =>
            setAcknowledged((prev) => ({ ...prev, [walkId]: acknowledgedAt }))
          }
        />
      ))}

      {hasUnresolved ? (
        <div className="h-12 flex flex-col items-center justify-center rounded-2xl border border-dashed border-brand-border text-brand-text-muted text-xs text-center px-4">
          Resolvé lo pendiente de arriba para poder reservar un paseo nuevo.
        </div>
      ) : (
        <Link
          href="/walks/new"
          className="h-12 flex items-center justify-center rounded-2xl bg-brand-primary text-white font-semibold text-sm hover:opacity-90 transition-opacity shadow-float"
        >
          Reservar paseo
        </Link>
      )}

      <Link
        href="/walks"
        className="h-12 flex items-center justify-center rounded-2xl border border-brand-border bg-brand-surface text-brand-text-body font-semibold text-sm hover:shadow-card transition-shadow"
      >
        Mis paseos
      </Link>
    </main>
  );
}
