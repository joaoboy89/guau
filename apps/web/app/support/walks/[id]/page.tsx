"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { AxiosError } from "axios";
import { useRequireAuth } from "@/lib/auth";
import { Container, Badge, Spinner } from "@/components/ui";
import { STATUS_LABEL, STATUS_VARIANT } from "@/lib/walk-status";
import { shortWalkId } from "@/lib/walk-id";
import { supportAPI, type SupportWalkCase } from "@/lib/support/api";
import { SignalsBanner } from "@/components/support/SignalsBanner";
import { CaseFicha } from "@/components/support/CaseFicha";
import { CaseTimeline } from "@/components/support/CaseTimeline";
import { ChatSection } from "@/components/support/ChatSection";

// Escritorio primero, deliberado (docs/diseños/modulo-soporte.md §7bis):
// soporte es un trabajo de escritorio. Usable en móvil, no optimizada.
export default function SupportCasePage() {
  const { ready } = useRequireAuth("admin");
  const params = useParams<{ id: string }>();

  const [walk, setWalk] = useState<SupportWalkCase | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready || !params.id) return;
    setLoading(true);
    setError(null);
    supportAPI
      .getCase(params.id)
      .then((res) => setWalk(res.data))
      .catch((err) => {
        const msg = (err as AxiosError<{ message: string }>)?.response?.data?.message;
        setError(msg ?? "No se pudo cargar este paseo. Probá de nuevo en un momento.");
      })
      .finally(() => setLoading(false));
  }, [ready, params.id]);

  if (!ready || loading) {
    return (
      <main className="flex flex-1 items-center justify-center py-20 text-brand-primary">
        <Spinner size={32} />
      </main>
    );
  }

  if (error || !walk) {
    return (
      <main className="flex-1 py-6">
        <Container width="wide" className="flex flex-col items-center gap-4">
          <p className="text-sm text-red-600">{error ?? "Paseo no encontrado."}</p>
          <Link href="/support" className="text-sm text-brand-primary font-semibold hover:opacity-80">
            ← Volver a la búsqueda
          </Link>
        </Container>
      </main>
    );
  }

  return (
    <main className="flex-1 py-6">
      <Container width="wide" className="flex flex-col gap-5">
        <header className="flex flex-col gap-2">
          <Link
            href="/support"
            className="text-sm text-brand-primary font-semibold hover:opacity-80 transition-opacity w-fit"
          >
            ← Volver a la búsqueda
          </Link>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl font-serif font-bold text-brand-text font-mono">
              {shortWalkId(walk.id)}
            </h1>
            <Badge variant={STATUS_VARIANT[walk.status] ?? "default"}>
              {STATUS_LABEL[walk.status] ?? walk.status}
            </Badge>
          </div>
        </header>

        {/* A) SEÑALES — la diferencia entre lo pactado y lo ocurrido */}
        <SignalsBanner walk={walk} />

        {/* B) LA FICHA — lo pactado */}
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-brand-text-muted uppercase tracking-wide">
            La ficha
          </h2>
          <CaseFicha walk={walk} />
        </section>

        {/* C) LA LINEA DE TIEMPO — lo ocurrido */}
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-brand-text-muted uppercase tracking-wide">
            Línea de tiempo
          </h2>
          <CaseTimeline walk={walk} />
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-brand-text-muted uppercase tracking-wide">
            Conversación
          </h2>
          <ChatSection walkId={walk.id} />
        </section>
      </Container>
    </main>
  );
}
