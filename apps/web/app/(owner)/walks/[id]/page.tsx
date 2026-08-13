"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useRequireAuth } from "@/lib/auth";
import { walksAPI, paymentsAPI } from "@/lib/api";
import { AxiosError } from "axios";
import { STATUS_LABEL, canCancelWalk } from "@/lib/walk-status";
import { Container, Button } from "@/components/ui";
import CancelWalkDialog from "@/components/CancelWalkDialog";

interface WalkDetail {
  id: string;
  status: string;
  scheduledAt: string;
  pickupAddress: string;
  totalAmount: number;
  isPaid: boolean;
  isExpired: boolean;
  walkType: { label: string; durationMinutes: number };
  walker: {
    user: { firstName: string; lastName: string };
  };
  participants: Array<{
    dog: { name: string; size: string };
  }>;
}

export default function WalkDetailPage() {
  const { ready } = useRequireAuth();
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();

  const [walk, setWalk] = useState<WalkDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [payError, setPayError] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const [paymentResult, setPaymentResult] = useState<string | null>(null);

  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  // Capturar el resultado de pago en estado y limpiar la URL para que:
  // (a) el banner no re-aparezca al refrescar
  // (b) "Atrás" no quede apuntando a esta URL con query param
  useEffect(() => {
    const result = searchParams.get("payment");
    if (result) {
      setPaymentResult(result);
      router.replace(`/walks/${params.id}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const dismissCancelDialog = () => {
    if (cancelling) return;
    setShowCancelDialog(false);
    setCancelReason("");
    setCancelError(null);
  };

  const handleCancelConfirm = async () => {
    if (!walk) return;
    setCancelling(true);
    setCancelError(null);
    try {
      await walksAPI.cancel(
        walk.id,
        cancelReason.trim() ? { cancellationReason: cancelReason.trim() } : undefined
      );
      // Se refresca desde el servidor, no se muta el estado local a mano —
      // que lo que se ve sea lo que el backend realmente guardó.
      const res = await walksAPI.getById(walk.id);
      setWalk(res.data);
      setShowCancelDialog(false);
      setCancelReason("");
    } catch (err) {
      const msg = (err as AxiosError<{ message: string }>)?.response?.data?.message;
      setCancelError(msg ?? "No se pudo cancelar la reserva");
    } finally {
      setCancelling(false);
    }
  };

  if (!ready || loading) return null;

  if (!walk) {
    return (
      <main className="flex-1 py-6 flex flex-col items-center justify-center">
        <Container width="content" className="flex flex-col items-center gap-4">
          <p className="text-sm text-brand-text-muted">Paseo no encontrado.</p>
          <Link href="/walks" className="text-sm text-brand-primary font-semibold hover:opacity-80 transition-opacity">
            ← Mis paseos
          </Link>
        </Container>
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
    <main className="flex-1 py-6">
      <Container width="content" className="flex flex-col gap-5">
        <header className="flex flex-col gap-1">
          <Link
            href="/walks"
            className="text-sm text-brand-primary font-semibold hover:opacity-80 transition-opacity w-fit"
          >
            ← Mis paseos
          </Link>
          <h1 className="text-xl font-serif font-bold text-brand-text">Detalle del paseo</h1>
        </header>

        {/* Banner de resultado de pago */}
        {paymentResult === "success" && (
          <div className="flex flex-col gap-2">
            <div className="px-4 py-3 rounded-xl bg-brand-green-soft border border-brand-green/30 text-sm font-semibold text-brand-green">
              Pago aprobado. ¡Gracias!
            </div>
            <Link
              href="/walks"
              className="text-sm text-center text-brand-primary font-semibold py-2 hover:opacity-80 transition-opacity"
            >
              ← Volver a Mis paseos
            </Link>
          </div>
        )}
        {paymentResult === "failure" && (
          <div className="flex flex-col gap-2">
            <div className="px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-sm font-semibold text-red-700">
              El pago fue rechazado. Podés intentarlo de nuevo.
            </div>
            <Link
              href="/walks"
              className="text-sm text-center text-brand-text-muted py-2 hover:opacity-80 transition-opacity"
            >
              ← Volver a Mis paseos
            </Link>
          </div>
        )}
        {paymentResult === "pending" && (
          <div className="flex flex-col gap-2">
            <div className="px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-sm font-semibold text-amber-700">
              Pago pendiente de acreditación.
            </div>
            <Link
              href="/walks"
              className="text-sm text-center text-brand-text-muted py-2 hover:opacity-80 transition-opacity"
            >
              ← Volver a Mis paseos
            </Link>
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
            {walk.isPaid ? (
              <div className="px-4 py-3 rounded-xl bg-brand-green-soft border border-brand-green/30 text-sm font-semibold text-brand-green">
                Pago completado
              </div>
            ) : walk.isExpired ? (
              // El guard real vive en el backend (createPreference rechaza
              // un scheduledAt pasado) — esto es solo cortesía, para no
              // ofrecer un botón que va a fallar.
              <div className="px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-700">
                Este paseo ya venció.
              </div>
            ) : (
              <>
                {payError && (
                  <div className="px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">
                    {payError}
                  </div>
                )}
                <Button size="lg" fullWidth onClick={handlePay} loading={paying}>
                  {paying ? "Redirigiendo a MercadoPago…" : `Pagar $${walk.totalAmount.toLocaleString("es-AR")}`}
                </Button>
              </>
            )}
          </div>
        )}

        {/* Paseo en curso — el dueño no tiene nada que hacer, pero tampoco
            puede quedarse sin ver nada. Hasta hoy estos tres estados eran
            inalcanzables, asi que el bloque de acciones solo contemplaba
            PENDING y CONFIRMED: un paseo que arranca dejaba la pantalla sin
            una sola linea debajo de los datos, incluido el "Pago completado"
            que se veia un segundo antes. Es un mensaje neutro, no
            funcionalidad nueva del lado del dueño. */}
        {(walk.status === "WALKER_ON_WAY" || walk.status === "IN_PROGRESS") && (
          <div className="px-4 py-3 rounded-xl bg-brand-primary-soft border border-brand-primary/20 text-sm text-brand-primary">
            {walk.status === "WALKER_ON_WAY"
              ? "El paseador está yendo a buscar a tu perro."
              : "El paseo está en curso."}
            {walk.isPaid && " Ya está pagado."}
          </div>
        )}

        {walk.status === "COMPLETED" && (
          <div className="px-4 py-3 rounded-xl bg-brand-green-soft border border-brand-green/30 text-sm font-semibold text-brand-green">
            Paseo completado.
          </div>
        )}

        {/* Cancelar — un solo botón, dos comportamientos: si no está pagado,
            cancela; si está pagado, la cancelación con devolución todavía no
            existe en la app y no hay ningún canal de contacto al que mandar
            (verificado: no hay mailto/whatsapp/contacto en todo el front) —
            así que el texto no promete ni un canal ni una plata que no se
            sabe si vuelve. */}
        {(walk.status === "PENDING" || walk.status === "CONFIRMED") && (
          canCancelWalk(walk.status, walk.isPaid) ? (
            <Button variant="secondary" fullWidth onClick={() => setShowCancelDialog(true)}>
              Cancelar reserva
            </Button>
          ) : (
            <p className="text-xs text-brand-text-muted px-1">
              Este paseo ya está pagado. La cancelación con devolución todavía no
              está disponible desde la app.
            </p>
          )
        )}
      </Container>

      <CancelWalkDialog
        open={showCancelDialog}
        reason={cancelReason}
        onReasonChange={setCancelReason}
        onDismiss={dismissCancelDialog}
        onConfirm={handleCancelConfirm}
        confirming={cancelling}
        error={cancelError}
      />
    </main>
  );
}
