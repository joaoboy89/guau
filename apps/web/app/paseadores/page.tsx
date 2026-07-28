"use client";

import { useState } from "react";
import Link from "next/link";
import { walkersAPI } from "@/lib/api";
import { Container, Card, Avatar, Badge, Spinner } from "@/components/ui";
import BarrioSelect from "@/components/BarrioSelect";
import LandingHeader from "@/components/landing/LandingHeader";
import type { Barrio } from "@/lib/barrios";

interface WalkerResult {
  id: string;
  bio: string | null;
  rating: number;
  totalReviews: number;
  maxDogsPerWalk: number;
  distanceKm: number;
  // Solo nombre de pila — el backend no devuelve apellido en respuestas públicas.
  user: {
    firstName: string;
    avatarUrl: string | null;
  };
}

type Status = "idle" | "loading" | "success" | "error";

export default function PaseadoresPage() {
  const [barrio, setBarrio] = useState<Barrio | null>(null);
  const [walkers, setWalkers] = useState<WalkerResult[]>([]);
  const [status, setStatus] = useState<Status>("idle");

  const handleBarrioChange = (b: Barrio | null) => {
    setBarrio(b);

    if (!b) {
      setStatus("idle");
      setWalkers([]);
      return;
    }

    setStatus("loading");
    walkersAPI
      .list({ lat: b.lat, lng: b.lng })
      .then((res) => {
        setWalkers(res.data);
        setStatus("success");
      })
      .catch(() => setStatus("error"));
  };

  return (
    <div className="flex min-h-dvh flex-col bg-brand-bg">
      <LandingHeader />

      <main className="flex-1 py-10">
        <Container width="content" className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <h1 className="font-serif text-3xl font-bold text-brand-text">
              Encontrá un paseador
            </h1>
            <p className="text-brand-text-body">
              Elegí tu barrio para ver quién está disponible cerca tuyo. No
              hace falta crear una cuenta para buscar.
            </p>
          </div>

          <div className="max-w-xs">
            <BarrioSelect
              value={barrio?.nombre ?? ""}
              onChange={handleBarrioChange}
              label="¿En qué barrio buscás?"
            />
          </div>

          {status === "idle" && (
            <div className="flex min-h-60 flex-col items-center justify-center gap-2 rounded-3xl border border-dashed border-brand-border p-6 text-center">
              <p className="text-sm text-brand-text-muted">
                Elegí un barrio arriba para ver los paseadores disponibles.
              </p>
            </div>
          )}

          {status === "loading" && (
            <div className="flex min-h-60 flex-1 items-center justify-center py-10 text-brand-primary">
              <Spinner size={32} />
            </div>
          )}

          {status === "error" && (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center text-sm text-red-700">
              No pudimos cargar los paseadores. Probá de nuevo en un momento.
            </div>
          )}

          {status === "success" && walkers.length === 0 && (
            <div className="flex min-h-60 flex-col items-center justify-center gap-2 rounded-3xl border border-dashed border-brand-border p-6 text-center">
              <p className="text-sm text-brand-text-muted">
                Todavía no hay paseadores disponibles en {barrio?.nombre}. Estamos
                empezando por Capital y zona norte, y sumamos paseadores todas
                las semanas.
              </p>
            </div>
          )}

          {status === "success" && walkers.length > 0 && (
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {walkers.map((w) => (
                <li key={w.id}>
                  <Link href={`/paseadores/${w.id}`} className="block h-full">
                    <Card interactive className="flex h-full flex-col gap-3">
                      <div className="flex items-center gap-3">
                        <Avatar
                          src={w.user.avatarUrl}
                          name={w.user.firstName}
                          size="md"
                        />
                        <div className="flex flex-col">
                          <span className="font-semibold text-brand-text-body">
                            {w.user.firstName}
                          </span>
                          <span className="text-xs text-brand-text-muted">
                            {w.distanceKm.toFixed(1)} km · ★ {w.rating.toFixed(1)} (
                            {w.totalReviews})
                          </span>
                        </div>
                      </div>

                      {/*
                        search() en el backend solo devuelve paseadores con
                        verificationStatus VERIFIED (filtro en el WHERE de la
                        query) — no viaja el campo en la respuesta porque no
                        hace falta: si aparece acá, ya está verificado.
                      */}
                      <Badge variant="success" className="w-fit">
                        Verificado
                      </Badge>

                      {w.bio && (
                        <p className="line-clamp-2 text-sm text-brand-text-body">
                          {w.bio}
                        </p>
                      )}
                    </Card>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Container>
      </main>
    </div>
  );
}
