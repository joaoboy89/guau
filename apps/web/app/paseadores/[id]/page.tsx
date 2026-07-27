"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { AxiosError } from "axios";
import { walkersAPI, reviewsAPI } from "@/lib/api";
import { useAuth } from "@/lib/store";
import { Container, Card, Avatar, Badge, Spinner, buttonStyles } from "@/components/ui";
import LandingHeader from "@/components/landing/LandingHeader";
import { summarizeSchedule } from "@/lib/schedule";

interface WalkerProfile {
  id: string;
  bio: string | null;
  rating: number;
  totalReviews: number;
  maxDogsPerWalk: number;
  schedules: Array<{ dayOfWeek: number; startTime: string; endTime: string }>;
  user: {
    firstName: string;
    lastName: string;
    avatarUrl: string | null;
  };
}

interface Review {
  id: string;
  rating: number;
  comment: string | null;
  reviewer: {
    firstName: string;
    lastName: string;
    avatarUrl: string | null;
  };
}

type Status = "loading" | "success" | "not-found" | "error";

export default function WalkerProfilePage() {
  const params = useParams<{ id: string }>();
  const { isLoggedIn } = useAuth();

  const [profile, setProfile] = useState<WalkerProfile | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [status, setStatus] = useState<Status>("loading");

  useEffect(() => {
    if (!params.id) return;
    setStatus("loading");
    Promise.all([walkersAPI.getById(params.id), reviewsAPI.byWalker(params.id)])
      .then(([profileRes, reviewsRes]) => {
        setProfile(profileRes.data);
        setReviews(reviewsRes.data.reviews ?? []);
        setStatus("success");
      })
      .catch((err: AxiosError) => {
        setStatus(err.response?.status === 404 ? "not-found" : "error");
      });
  }, [params.id]);

  if (status === "loading") {
    return (
      <div className="flex min-h-dvh flex-col bg-brand-bg">
        <LandingHeader />
        <main className="flex flex-1 items-center justify-center py-20 text-brand-primary">
          <Spinner size={32} />
        </main>
      </div>
    );
  }

  if (status === "not-found" || status === "error" || !profile) {
    return (
      <div className="flex min-h-dvh flex-col bg-brand-bg">
        <LandingHeader />
        <main className="flex flex-1 flex-col items-center justify-center gap-4 py-20 text-center">
          <p className="text-sm text-brand-text-muted">
            {status === "not-found"
              ? "No encontramos este paseador."
              : "No pudimos cargar este perfil. Probá de nuevo en un momento."}
          </p>
          <Link href="/paseadores" className={buttonStyles({ variant: "secondary" })}>
            ← Volver a la búsqueda
          </Link>
        </main>
      </div>
    );
  }

  const fullName = `${profile.user.firstName} ${profile.user.lastName}`;
  // Sin sesión: hay que crear cuenta antes de reservar. Con sesión, directo
  // al flujo de reserva — el `next` queda para cuando el registro/login
  // sepan retomar a esta página (todavía no lo hacen).
  const reserveHref = isLoggedIn
    ? "/walks/new"
    : `/register?role=owner&next=/paseadores/${params.id}`;

  return (
    <div className="flex min-h-dvh flex-col bg-brand-bg">
      <LandingHeader />

      <main className="flex-1 py-10">
        <Container width="content" className="flex flex-col gap-8">
          <Card className="flex flex-col gap-4 sm:flex-row sm:items-start">
            <Avatar src={profile.user.avatarUrl} name={fullName} size="xl" />

            <div className="flex flex-1 flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-serif text-2xl font-bold text-brand-text">
                  {fullName}
                </h1>
                {/* getPublicProfile ya tira 404 si no está VERIFIED — llegar
                    hasta acá implica que lo está. */}
                <Badge variant="success">Verificado</Badge>
              </div>

              <p className="text-sm text-brand-text-muted">
                ★ {profile.rating.toFixed(1)} ·{" "}
                {profile.totalReviews === 1
                  ? "1 reseña"
                  : `${profile.totalReviews} reseñas`}{" "}
                · hasta {profile.maxDogsPerWalk} perros por paseo
              </p>

              {profile.bio && (
                <p className="text-brand-text-body">{profile.bio}</p>
              )}

              <div className="flex flex-col gap-2 pt-2">
                <Link
                  href={reserveHref}
                  className={buttonStyles({ size: "lg", className: "w-full sm:w-auto" })}
                >
                  Reservar un paseo
                </Link>
                {!isLoggedIn && (
                  <p className="text-xs text-brand-text-muted">
                    Para reservar hace falta crear una cuenta gratis.
                  </p>
                )}
              </div>
            </div>
          </Card>

          {profile.schedules.length > 0 && (
            <Card className="flex flex-col gap-2">
              <h2 className="font-serif text-lg font-bold text-brand-text">
                Horarios
              </h2>
              <p className="text-sm text-brand-text-body">
                {summarizeSchedule(profile.schedules)}
              </p>
            </Card>
          )}

          <div className="flex flex-col gap-3">
            <h2 className="font-serif text-lg font-bold text-brand-text">
              Reseñas {reviews.length > 0 && `(${reviews.length})`}
            </h2>

            {reviews.length === 0 ? (
              <p className="text-sm text-brand-text-muted">
                Este paseador todavía no tiene reseñas.
              </p>
            ) : (
              <ul className="flex flex-col gap-3">
                {reviews.map((r) => (
                  <li key={r.id}>
                    <Card className="flex flex-col gap-2">
                      <div className="flex items-center gap-2">
                        <Avatar
                          src={r.reviewer.avatarUrl}
                          name={`${r.reviewer.firstName} ${r.reviewer.lastName}`}
                          size="xs"
                        />
                        <span className="text-sm font-semibold text-brand-text-body">
                          {r.reviewer.firstName} {r.reviewer.lastName[0]}.
                        </span>
                        <span className="text-xs text-brand-text-muted">
                          ★ {r.rating}
                        </span>
                      </div>
                      {r.comment && (
                        <p className="text-sm text-brand-text-body">{r.comment}</p>
                      )}
                    </Card>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Container>
      </main>
    </div>
  );
}
