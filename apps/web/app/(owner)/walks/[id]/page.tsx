"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useRequireAuth } from "@/lib/auth";
import { walksAPI, paymentsAPI } from "@/lib/api";
import { Logo } from "@/components/Logo";
import { AxiosError } from "axios";

interface WalkDetail {
  id: string;
  status: string;
  scheduledAt: string;
  pickupAddress: string;
  totalAmount: number;
  mpPaymentId: string | null;
  walkType: { label: string; durationMinutes: number };
  walker: {
    user: { firstName: string; lastName: string };
  };
  participants: Array<{
    dog: { name: string; size: string };
  }>;
}

const STATUS_LABEL: Record<string, string> = {
  PENDING:           "Pendiente de confirmación",
  CONFIRMED:         "Confirmado",
  WALKER_ON_WAY:     "Paseador en camino",
  IN_PROGRESS:       "Paseo en curso",
  COMPLETED:         "Completado",
  CANCELLED_OWNER:   "Cancelado por el dueño",
  CANCELLED_WALKER:  "Cancelado por el paseador",
};

export default function WalkDetailPage() {
  const { ready } = useRequireAuth();
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();

  const [walk, setWalk] = useState<WalkDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [payError, setPayError] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);

  const paymentParam = searchParams.get("payment");

  useEffect(() => {
    if (!ready || !params.id) return;
    walksAPI
      .getById(params.id)
      .then((res) => setWalk(res.data))
      .finally(() => setLoading(false));
  }, [ready, params.id]);

  const handlePay = async () => {
    if (!walk) return;
    setPaying(true);
    setPayError(null);
    try {
      const res = await paymentsAPI.createPreference({ walkId: walk.id });
      const initPoint: string = res.data.initPoint;
      window.location.href = initPoint;
    } catch (err) {
      const msg = (err as AxiosError<{ message: string }>)?.response?.data?.message;
      setPayError(msg ?? "No se pudo iniciar el pago");
      setPaying(false);
    }
  };

  if (!ready || loading) return null;

  if (!walk) {
    return (
      <main className="min-h-dvh bg-brand-bg p-6 flex items-center justify-center">
        <p className="text-sm text-brand-text-muted">Paseo no encontrado.</p>
      </main>
    );
  }

  const dogs = walk.participants.map((p) => p.dog);
  const walkerName = `${walk.walker.user.firstName} ${walk.walker.user.lastName}`;
  const dateStr = new Date(walk.scheduledAt).toLocaleString("es-AR", {
    dateStyle: "long",
    timeStyle: "short",
  });

  return (
    <main className="min-h-dvh bg-brand-bg p-6 flex flex-col gap-5 max-w-lg mx-auto">
      <header className="flex items-center gap-3">
        <Logo size={32} />
        <h1 className="text-xl font-serif font-bold text-brand-text">Detalle del paseo</h1>
      </header>

      {/* Banner de resultado de pago */}
      {paymentParam === "success" && (
        <div className="px-4 py-3 rounded-xl bg-brand-green-soft border border-brand-green/30 text-sm font-semibold text-brand-green">
          Pago aprobado. ¡Gracias!
        </div>
      )}
      {paymentParam === "failure" && (
        <div className="px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-sm font-semibold text-red-700">
          El pago fue rechazado. Podés intentarlo de nuevo.
        </div>
      )}
      {paymentParam === "pending" && (
        <div className="px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-sm font-semibold text-amber-700">
          Pago pendiente de acreditación.
        </div>
      )}

      {/* Datos del paseo */}
      <section className="bg-brand-surface rounded-2xl p-5 shadow-card border border-brand-border flex flex-col gap-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-col gap-0.5">
            <span className="text-base font-semibold text-brand-text-body">
              {walk.walkType.label}
            </span>
            <span className="text-xs text-brand-text-muted">{dateStr}</span>
          </div>
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-brand-primary-soft text-brand-primary shrink-0">
            {STATUS_LABEL[walk.status] ?? walk.status}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="flex flex-col gap-0.5">
            <span className="text-xs text-brand-text-muted">Paseador</span>
            <span className="font-medium text-brand-text-body">{walkerName}</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-xs text-brand-text-muted">Monto total</span>
            <span className="font-medium text-brand-text-body">
              ${walk.totalAmount.toLocaleString("es-AR")}
            </span>
          </div>
          <div className="flex flex-col gap-0.5 col-span-2">
            <span className="text-xs text-brand-text-muted">Dirección</span>
            <span className="font-medium text-brand-text-body">{walk.pickupAddress}</span>
          </div>
          <div className="flex flex-col gap-0.5 col-span-2">
            <span className="text-xs text-brand-text-muted">
              {dogs.length === 1 ? "Perro" : "Perros"}
            </span>
            <span className="font-medium text-brand-text-body">
              {dogs.map((d) => d.name).join(", ")}
            </span>
          </div>
        </div>
      </section>

      {/* Acción según estado */}
      {walk.status === "PENDING" && (
        <div className="px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-700">
          Esperando que el paseador confirme tu reserva.
        </div>
      )}

      {walk.status === "CONFIRMED" && (
        <div className="flex flex-col gap-3">
          {walk.mpPaymentId ? (
            <div className="px-4 py-3 rounded-xl bg-brand-green-soft border border-brand-green/30 text-sm font-semibold text-brand-green">
              Pago iniciado
            </div>
          ) : (
            <>
              {payError && (
                <div className="px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">
                  {payError}
                </div>
              )}
              <button
                onClick={handlePay}
                disabled={paying}
                className="h-13 rounded-2xl bg-brand-primary text-white font-semibold text-base disabled:opacity-40 transition-opacity hover:opacity-90 shadow-float"
              >
                {paying ? "Redirigiendo a MercadoPago…" : `Pagar $${walk.totalAmount.toLocaleString("es-AR")}`}
              </button>
            </>
          )}
        </div>
      )}
    </main>
  );
}
