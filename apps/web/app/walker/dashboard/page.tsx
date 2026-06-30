"use client";

import { useEffect, useState } from "react";
import { useRequireAuth, useLogout } from "@/lib/auth";
import { walkersAPI, paymentsAPI } from "@/lib/api";
import { Logo } from "@/components/Logo";

interface WalkerProfile {
  id:                 string;
  bio:                string | null;
  isAvailable:        boolean;
  verificationStatus: "PENDING" | "VERIFIED" | "REJECTED";
  user: {
    firstName: string;
    lastName:  string;
    email:     string;
  };
}

const BADGE: Record<
  WalkerProfile["verificationStatus"],
  { label: string; className: string }
> = {
  PENDING:  { label: "En revisión", className: "bg-amber-50 text-amber-700" },
  VERIFIED: { label: "Verificado",  className: "bg-brand-green-soft text-brand-green" },
  REJECTED: { label: "Rechazado",   className: "bg-red-50 text-red-700" },
};

export default function WalkerDashboardPage() {
  const { user, ready }             = useRequireAuth();
  const logout                      = useLogout();
  const [profile, setProfile]       = useState<WalkerProfile | null>(null);
  const [available, setAvailable]   = useState(false);
  const [toggling, setToggling]     = useState(false);
  const [availError, setAvailError] = useState<string | null>(null);
  const [connectLoading, setConnectLoading] = useState(false);

  useEffect(() => {
    if (!ready) return;
    walkersAPI.myProfile().then((res) => {
      const p: WalkerProfile = res.data;
      setProfile(p);
      setAvailable(p.isAvailable);
    });
  }, [ready]);

  const toggleAvailability = async () => {
    if (!profile || toggling) return;
    setToggling(true);
    setAvailError(null);
    const next = !available;
    try {
      await walkersAPI.updateAvailability({ isAvailable: next });
      setAvailable(next);
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 403) {
        setAvailError("Tu cuenta está en revisión. Te avisamos cuando puedas activarte.");
      } else {
        setAvailError("No se pudo actualizar la disponibilidad. Intentá de nuevo.");
      }
    } finally {
      setToggling(false);
    }
  };

  const connectMercadoPago = async () => {
    setConnectLoading(true);
    try {
      const res = await paymentsAPI.walkerConnect();
      window.location.href = res.data.url;
    } catch {
      setConnectLoading(false);
    }
  };

  if (!ready || !profile) return null;

  const badge    = BADGE[profile.verificationStatus];
  const fullName = `${profile.user.firstName} ${profile.user.lastName}`;

  return (
    <main className="min-h-dvh bg-brand-bg">
      <div className="w-full max-w-md mx-auto px-6 py-6 flex flex-col gap-6 min-h-dvh">

      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Logo size={36} />
          <div>
            <h1 className="text-xl font-serif font-bold text-brand-text">Mi panel</h1>
            <p className="text-xs text-brand-text-muted">{fullName} · {user?.email}</p>
          </div>
        </div>
        <button
          onClick={logout}
          className="text-sm px-4 py-2 rounded-xl border border-brand-border text-brand-text-muted transition-opacity hover:opacity-70"
        >
          Salir
        </button>
      </header>

      {/* Estado de verificación */}
      <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-brand-surface-sand border border-brand-border">
        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${badge.className}`}>
          {badge.label}
        </span>
        <span className="text-sm text-brand-text-muted">
          {profile.verificationStatus === "PENDING"
            ? "Estamos revisando tu cuenta. Te notificamos cuando esté lista."
            : profile.verificationStatus === "VERIFIED"
            ? "Tu cuenta está verificada y podés recibir solicitudes."
            : "Tu cuenta fue rechazada. Contactanos para más información."}
        </span>
      </div>

      {/* Toggle de disponibilidad */}
      <div className="flex items-center justify-between px-4 py-4 rounded-2xl bg-brand-surface border border-brand-border">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-semibold text-brand-text-body">Disponible para paseos</span>
          <span className="text-xs text-brand-text-muted">
            {available ? "Aparecés en los resultados de búsqueda" : "No aparecés en búsquedas"}
          </span>
        </div>
        <button
          onClick={toggleAvailability}
          disabled={toggling}
          className={`relative w-11 h-6 rounded-full overflow-hidden transition-colors disabled:opacity-50 ${
            available ? "bg-brand-primary" : "bg-brand-border"
          }`}
          aria-label="Cambiar disponibilidad"
        >
          <span
            className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
              available ? "translate-x-5" : "translate-x-0"
            }`}
          />
        </button>
      </div>

      {availError && (
        <div className="text-sm px-4 py-3 rounded-xl bg-red-50 text-red-700 border border-red-200">
          {availError}
        </div>
      )}

      {/* Conectar MercadoPago — color oficial de MercadoPago */}
      <button
        onClick={connectMercadoPago}
        disabled={connectLoading}
        className="h-12 rounded-2xl font-semibold text-white transition-opacity disabled:opacity-50"
        style={{ backgroundColor: "#009ee3" }}
      >
        {connectLoading ? "Redirigiendo…" : "Conectar MercadoPago"}
      </button>

      {/* Placeholder paseos */}
      <div className="flex-1 flex items-center justify-center rounded-3xl border border-dashed border-brand-border min-h-40">
        <p className="text-sm text-brand-text-muted">
          Tus paseos aparecerán acá — próxima sesión
        </p>
      </div>

      </div>
    </main>
  );
}
