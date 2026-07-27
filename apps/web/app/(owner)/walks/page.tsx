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
  walkType: { label: string };
  walker: { user: { firstName: string; lastName: string } };
}

export default function WalksPage() {
  const { ready } = useRequireAuth();
  const [walks, setWalks] = useState<Walk[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ready) return;
    walksAPI
      .list()
      .then((res) => setWalks(res.data))
      .finally(() => setLoading(false));
  }, [ready]);

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
        <ul className="flex flex-col gap-3">
          {walks.map((walk) => {
            const dateStr = new Date(walk.scheduledAt).toLocaleString("es-AR", {
              dateStyle: "long",
              timeStyle: "short",
            });
            const walkerName = `${walk.walker.user.firstName} ${walk.walker.user.lastName}`;

            return (
              <li key={walk.id}>
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
                  </Card>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Container>
  );
}
