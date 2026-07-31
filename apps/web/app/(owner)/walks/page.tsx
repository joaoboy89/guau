"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRequireAuth } from "@/lib/auth";
import { walksAPI } from "@/lib/api";
import { STATUS_LABEL, STATUS_VARIANT } from "@/lib/walk-status";
import { Container, Card, Badge, Spinner, buttonStyles } from "@/components/ui";

interface Walk {
  id: string;
  status: string;
  scheduledAt: string;
  totalAmount: number;
  isPaid: boolean;
  isExpired: boolean;
  walkType: { label: string };
  walker: { user: { firstName: string; lastName: string } };
}

interface WalksMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  days: number;
}

export default function WalksPage() {
  const { ready } = useRequireAuth();
  const [walks, setWalks] = useState<Walk[]>([]);
  const [meta, setMeta] = useState<WalksMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    if (!ready) return;
    walksAPI
      .list()
      .then((res) => {
        setWalks(res.data.data);
        setMeta(res.data.meta);
      })
      .finally(() => setLoading(false));
  }, [ready]);

  const handleLoadMore = async () => {
    if (!meta || loadingMore) return;
    const nextPage = meta.page + 1;
    if (nextPage > meta.totalPages) return;
    setLoadingMore(true);
    try {
      const res = await walksAPI.list({ page: nextPage });
      setWalks((prev) => [...prev, ...res.data.data]);
      setMeta(res.data.meta);
    } finally {
      setLoadingMore(false);
    }
  };

  // Lo accionable del dueño no es PENDING (ahí no puede hacer nada, está
  // esperando al paseador) — es lo que ya está confirmado y sin pagar. Se
  // deriva de la misma lista: el dueño tiene pocos paseos activos, no hace
  // falta una llamada aparte (a diferencia de "Requieren confirmación" del
  // paseador, que si puede acumular pendientes viejos fuera de la ventana).
  const pendingPayment = walks.filter(
    (w) => w.status === "CONFIRMED" && !w.isPaid && !w.isExpired
  );
  const history = walks.filter((w) => !pendingPayment.includes(w));

  /**
   * Antes esto devolvía `null`: pantalla en blanco mientras carga, que se
   * lee como "la app se rompió" en una conexión lenta. Un spinner cuesta
   * lo mismo y dice "esperá", que es la verdad.
   */
  if (!ready || loading) {
    return (
      <main className="flex flex-1 items-center justify-center py-20 text-brand-primary">
        <Spinner size={32} />
      </main>
    );
  }

  return (
    <Container width="content" as="main" className="flex flex-1 flex-col gap-6 py-6">
      <header className="flex items-center justify-between gap-4">
        <h1 className="font-serif text-xl font-bold text-brand-text">Mis paseos</h1>
        <Link href="/walks/new" className={buttonStyles({ size: "sm" })}>
          Reservar
        </Link>
      </header>

      {walks.length === 0 ? (
        <div className="flex min-h-60 flex-1 flex-col items-center justify-center gap-4 rounded-3xl border border-dashed border-brand-border p-6 text-center">
          <p className="text-sm text-brand-text-muted">
            Todavía no reservaste ningún paseo.
          </p>
          <Link href="/walks/new" className={buttonStyles({})}>
            Reservar un paseo
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {pendingPayment.length > 0 && (
            <div className="flex flex-col gap-3">
              <p className="text-xs font-semibold text-brand-text-muted uppercase tracking-wide">
                Pendientes de pago
              </p>
              <ul className="flex flex-col gap-3">
                {pendingPayment.map((walk) => (
                  <WalkCard key={walk.id} walk={walk} showPayCta />
                ))}
              </ul>
            </div>
          )}

          {history.length > 0 && (
            <div className="flex flex-col gap-3">
              {pendingPayment.length > 0 && (
                <p className="text-xs font-semibold text-brand-text-muted uppercase tracking-wide">
                  Historial
                </p>
              )}
              <ul className="flex flex-col gap-3">
                {history.map((walk) => (
                  <WalkCard key={walk.id} walk={walk} />
                ))}
              </ul>

              {meta && meta.page < meta.totalPages && (
                <button
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                  className="self-center text-sm font-semibold text-brand-primary disabled:opacity-50"
                >
                  {loadingMore ? "Cargando…" : "Cargar más"}
                </button>
              )}

              {meta && (
                <p className="text-xs text-brand-text-muted text-center">
                  Mostrando tus paseos de los últimos {meta.days} días.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </Container>
  );
}

function WalkCard({ walk, showPayCta }: { walk: Walk; showPayCta?: boolean }) {
  const dateStr = new Date(walk.scheduledAt).toLocaleString("es-AR", {
    dateStyle: "long",
    timeStyle: "short",
  });
  const walkerName = `${walk.walker.user.firstName} ${walk.walker.user.lastName}`;

  return (
    <li>
      <Link href={`/walks/${walk.id}`} className="block">
        <Card interactive className="flex flex-col gap-2">
          <div className="flex items-start justify-between gap-2">
            <span className="text-sm font-semibold text-brand-text-body">
              {walk.walkType.label}
            </span>
            <Badge
              variant={STATUS_VARIANT[walk.status] ?? "default"}
              className="shrink-0"
            >
              {STATUS_LABEL[walk.status] ?? walk.status}
            </Badge>
          </div>
          <p className="text-xs text-brand-text-muted">{dateStr}</p>
          <p className="text-xs text-brand-text-muted">
            Paseador: {walkerName}
          </p>
          {showPayCta && (
            <span className={buttonStyles({ size: "sm", className: "mt-1 w-fit" })}>
              Pagar ${walk.totalAmount.toLocaleString("es-AR")}
            </span>
          )}
        </Card>
      </Link>
    </li>
  );
}
