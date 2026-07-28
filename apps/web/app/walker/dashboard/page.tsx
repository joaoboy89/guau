"use client";

import { useEffect, useState } from "react";
import { useRequireAuth } from "@/lib/auth";
import { walkersAPI, paymentsAPI, walksAPI } from "@/lib/api";
import { STATUS_LABEL } from "@/lib/walk-status";
import { DAY_LABELS } from "@/lib/schedule";
import { findNearestBarrio, type Barrio } from "@/lib/barrios";
import BarrioSelect from "@/components/BarrioSelect";
import { AxiosError } from "axios";

interface WalkerSchedule {
  id:        string;
  dayOfWeek: number;
  startTime: string;
  endTime:   string;
  isActive:  boolean;
}

interface WalkerProfile {
  id:                 string;
  bio:                string | null;
  isAvailable:        boolean;
  verificationStatus: "PENDING" | "VERIFIED" | "REJECTED";
  centerLat:          number | null;
  centerLng:          number | null;
  radiusKm:           number | null;
  mpConnected:        boolean;
  mpUserId:           string | null;
  schedules:          WalkerSchedule[];
  user: {
    firstName: string;
    lastName:  string;
    email:     string;
  };
}

interface DayRow {
  dayOfWeek:  number;
  scheduleId: string | null;
  active:     boolean;
  startTime:  string;
  endTime:    string;
  saving:     boolean;
  error:      string | null;
}

function buildDefaultDays(): DayRow[] {
  return DAY_LABELS.map((_, dayOfWeek) => ({
    dayOfWeek,
    scheduleId: null,
    active:     false,
    startTime:  "09:00",
    endTime:    "18:00",
    saving:     false,
    error:      null,
  }));
}

interface WalkItem {
  id: string;
  status: string;
  scheduledAt: string;
  walkType: { label: string };
  participants: Array<{
    dog:   { name: string };
    owner: { user: { firstName: string; lastName: string } };
  }>;
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
  const [profile, setProfile]       = useState<WalkerProfile | null>(null);
  const [available, setAvailable]   = useState(false);
  const [toggling, setToggling]     = useState(false);
  const [availError, setAvailError] = useState<string | null>(null);
  const [connectLoading, setConnectLoading] = useState(false);

  const [walks, setWalks]           = useState<WalkItem[]>([]);
  const [actioning, setActioning]   = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [zoneSaving, setZoneSaving] = useState(false);
  const [zoneError, setZoneError]   = useState<string | null>(null);
  const [barrio, setBarrio]         = useState<Barrio | null>(null);
  const [radiusInput, setRadiusInput] = useState(20);

  const [days, setDays] = useState<DayRow[]>(buildDefaultDays());

  useEffect(() => {
    if (!ready) return;
    walkersAPI.myProfile().then((res) => {
      const p: WalkerProfile = res.data;
      setProfile(p);
      setAvailable(p.isAvailable);
      if (p.centerLat != null && p.centerLng != null) {
        setBarrio(findNearestBarrio(p.centerLat, p.centerLng));
      }
      setDays((prev) =>
        prev.map((row) => {
          const match = p.schedules.find((s) => s.dayOfWeek === row.dayOfWeek);
          return match
            ? { ...row, scheduleId: match.id, active: true, startTime: match.startTime, endTime: match.endTime }
            : row;
        })
      );
    });
    walksAPI.list().then((res) => setWalks(res.data));
  }, [ready]);

  useEffect(() => {
    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        setConnectLoading(false);
      }
    };
    window.addEventListener("pageshow", handlePageShow);
    return () => window.removeEventListener("pageshow", handlePageShow);
  }, []);

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

  // La zona de trabajo se elige por barrio, no por geolocalización: un
  // paseador puede vivir en provincia y trabajar en Capital, moviéndose
  // hacia la demanda como un conductor de apps. A diferencia de un
  // conductor, acá los paseos se reservan con anticipación, así que el
  // paseador puede comprometerse de antemano a una zona sin necesidad de
  // estar parado en ella.
  const handleSaveZone = async () => {
    if (!barrio || zoneSaving) return;
    setZoneSaving(true);
    setZoneError(null);
    try {
      await walkersAPI.setZone({
        centerLat: barrio.lat,
        centerLng: barrio.lng,
        radiusKm:  radiusInput,
      });
      setProfile((prev) =>
        prev ? { ...prev, centerLat: barrio.lat, centerLng: barrio.lng, radiusKm: radiusInput } : prev
      );
    } catch (err: unknown) {
      const msg = (err as AxiosError<{ message: string }>)?.response?.data?.message;
      setZoneError(msg ?? "No se pudo guardar la zona. Intentá de nuevo.");
    } finally {
      setZoneSaving(false);
    }
  };

  const updateDay = (dayOfWeek: number, patch: Partial<DayRow>) => {
    setDays((prev) => prev.map((row) => (row.dayOfWeek === dayOfWeek ? { ...row, ...patch } : row)));
  };

  const handleSaveDay = async (dayOfWeek: number) => {
    const row = days.find((d) => d.dayOfWeek === dayOfWeek);
    if (!row || row.saving) return;

    if (row.active && row.startTime >= row.endTime) {
      updateDay(dayOfWeek, { error: "La hora de inicio debe ser antes que la de fin" });
      return;
    }

    updateDay(dayOfWeek, { saving: true, error: null });
    try {
      if (row.active) {
        if (row.scheduleId) {
          await walkersAPI.updateSchedule(row.scheduleId, {
            startTime: row.startTime,
            endTime:   row.endTime,
            isActive:  true,
          });
        } else {
          const res = await walkersAPI.createSchedule({
            dayOfWeek: row.dayOfWeek,
            startTime: row.startTime,
            endTime:   row.endTime,
          });
          updateDay(dayOfWeek, { scheduleId: res.data.id });
        }
      } else if (row.scheduleId) {
        await walkersAPI.updateSchedule(row.scheduleId, { isActive: false });
      }
    } catch (err: unknown) {
      const msg = (err as AxiosError<{ message: string }>)?.response?.data?.message;
      updateDay(dayOfWeek, { error: msg ?? "No se pudo guardar. Intentá de nuevo." });
    } finally {
      updateDay(dayOfWeek, { saving: false });
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

  const handleConfirm = async (walkId: string) => {
    if (actioning) return;
    setActioning(walkId);
    setActionError(null);
    try {
      await walksAPI.confirm(walkId);
      setWalks((prev) =>
        prev.map((w) => (w.id === walkId ? { ...w, status: "CONFIRMED" } : w))
      );
    } catch (err: unknown) {
      const msg = (err as AxiosError<{ message: string }>)?.response?.data?.message;
      setActionError(msg ?? "No se pudo confirmar el paseo. Intentá de nuevo.");
    } finally {
      setActioning(null);
    }
  };

  const handleReject = async (walkId: string) => {
    if (actioning) return;
    setActioning(walkId);
    setActionError(null);
    try {
      await walksAPI.reject(walkId);
      setWalks((prev) =>
        prev.map((w) => (w.id === walkId ? { ...w, status: "CANCELLED_WALKER" } : w))
      );
    } catch (err: unknown) {
      const msg = (err as AxiosError<{ message: string }>)?.response?.data?.message;
      setActionError(msg ?? "No se pudo rechazar el paseo. Intentá de nuevo.");
    } finally {
      setActioning(null);
    }
  };

  if (!ready || !profile) return null;

  const badge    = BADGE[profile.verificationStatus];
  const fullName = `${profile.user.firstName} ${profile.user.lastName}`;

  const pendingWalks = walks.filter((w) => w.status === "PENDING");
  const otherWalks   = walks.filter((w) => w.status !== "PENDING");

  return (
    <main className="flex-1 p-6 flex flex-col gap-6">

      <div>
        <h1 className="text-xl font-serif font-bold text-brand-text">Mi panel</h1>
        <p className="text-xs text-brand-text-muted">{fullName} · {user?.email}</p>
      </div>

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

      {/* Warning: sin horarios cargados */}
      {profile.schedules.length === 0 && (
        <div className="flex flex-col gap-1.5 px-4 py-3 rounded-2xl bg-amber-50 border border-amber-200">
          <p className="text-sm font-semibold text-amber-800">
            Sin horarios cargados no aparecés en las búsquedas ni podés recibir reservas.
          </p>
          <a href="#horarios" className="text-xs font-semibold text-amber-800 underline underline-offset-2 w-fit">
            Cargar mis horarios ↓
          </a>
        </div>
      )}

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

      {/* Zona de trabajo */}
      <div className="flex flex-col gap-3 px-4 py-4 rounded-2xl bg-brand-surface border border-brand-border">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-semibold text-brand-text-body">Zona de trabajo</span>
          {profile.centerLat != null && profile.centerLng != null && profile.radiusKm != null && (
            <span className="text-xs text-brand-text-muted">
              Trabajás en {findNearestBarrio(profile.centerLat, profile.centerLng).nombre}, hasta {profile.radiusKm} km a la redonda
            </span>
          )}
        </div>

        {(profile.centerLat == null || profile.centerLng == null || profile.radiusKm == null) && (
          <div className="flex flex-col gap-1.5 px-4 py-3 rounded-2xl bg-amber-50 border border-amber-200">
            <p className="text-sm font-semibold text-amber-800">
              Todavía no configuraste tu zona de trabajo — sin zona no aparecés en ninguna búsqueda.
            </p>
          </div>
        )}

        <BarrioSelect
          value={barrio?.nombre ?? ""}
          onChange={setBarrio}
          label="¿En qué barrio querés trabajar?"
        />

        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-brand-text-body">
            <span className="shrink-0">Radio (km):</span>
            <input
              type="number"
              min={0.5}
              max={20}
              step={0.5}
              value={radiusInput}
              onChange={(e) => setRadiusInput(Number(e.target.value))}
              className="w-20 h-9 px-3 rounded-xl border border-brand-border bg-brand-bg text-sm text-brand-text focus:outline-none focus:border-brand-primary"
            />
          </label>
          <button
            onClick={handleSaveZone}
            disabled={zoneSaving || !barrio}
            className="flex-1 h-9 rounded-xl bg-brand-primary text-white text-sm font-semibold disabled:opacity-40 transition-opacity hover:opacity-90"
          >
            {zoneSaving ? "Guardando…" : "Guardar zona"}
          </button>
        </div>

        {zoneError && (
          <p className="text-xs text-red-700">{zoneError}</p>
        )}
      </div>

      {/* Mis horarios */}
      <div id="horarios" className="flex flex-col gap-3 px-4 py-4 rounded-2xl bg-brand-surface border border-brand-border">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-semibold text-brand-text-body">Mis horarios</span>
          <span className="text-xs text-brand-text-muted">
            Días y horarios en los que aparecés disponible para nuevas reservas — hora Argentina
          </span>
        </div>

        <div className="flex flex-col">
          {days.map((row) => (
            <div key={row.dayOfWeek} className="flex flex-col gap-2 py-3 border-t border-brand-border first:border-t-0 first:pt-0">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => updateDay(row.dayOfWeek, { active: !row.active })}
                    className={`relative w-11 h-6 rounded-full overflow-hidden transition-colors shrink-0 ${
                      row.active ? "bg-brand-primary" : "bg-brand-border"
                    }`}
                    aria-label={`Activar ${DAY_LABELS[row.dayOfWeek]}`}
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                        row.active ? "translate-x-5" : "translate-x-0"
                      }`}
                    />
                  </button>
                  <span className="text-sm font-medium text-brand-text-body">
                    {DAY_LABELS[row.dayOfWeek]}
                  </span>
                </div>
                <button
                  onClick={() => handleSaveDay(row.dayOfWeek)}
                  disabled={row.saving}
                  className="h-8 px-3 rounded-lg bg-brand-primary text-white text-xs font-semibold disabled:opacity-40 transition-opacity hover:opacity-90 shrink-0"
                >
                  {row.saving ? "Guardando…" : "Guardar"}
                </button>
              </div>

              {row.active && (
                <div className="flex items-center gap-2 pl-14">
                  <input
                    type="time"
                    value={row.startTime}
                    onChange={(e) => updateDay(row.dayOfWeek, { startTime: e.target.value })}
                    className="h-9 px-2 rounded-lg border border-brand-border bg-brand-bg text-sm text-brand-text focus:outline-none focus:border-brand-primary"
                  />
                  <span className="text-xs text-brand-text-muted">a</span>
                  <input
                    type="time"
                    value={row.endTime}
                    onChange={(e) => updateDay(row.dayOfWeek, { endTime: e.target.value })}
                    className="h-9 px-2 rounded-lg border border-brand-border bg-brand-bg text-sm text-brand-text focus:outline-none focus:border-brand-primary"
                  />
                </div>
              )}

              {row.error && <p className="text-xs text-red-700 pl-14">{row.error}</p>}
            </div>
          ))}
        </div>
      </div>

      {/* MercadoPago */}
      {profile.mpConnected ? (
        <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-brand-surface border border-brand-border">
          <span className="flex-1 flex items-center gap-2 text-sm font-semibold text-brand-green">
            <span>MercadoPago conectado ✓</span>
            {profile.mpUserId && (
              <span className="font-normal text-xs text-brand-text-muted">
                (ID {profile.mpUserId})
              </span>
            )}
          </span>
          <button
            onClick={connectMercadoPago}
            disabled={connectLoading}
            className="text-xs text-brand-text-muted underline underline-offset-2 transition-opacity hover:opacity-70 disabled:opacity-40"
          >
            {connectLoading ? "Redirigiendo…" : "Reconectar"}
          </button>
        </div>
      ) : (
        <button
          onClick={connectMercadoPago}
          disabled={connectLoading}
          className="w-full sm:w-auto h-12 px-8 rounded-2xl font-semibold text-white transition-opacity disabled:opacity-50"
          style={{ backgroundColor: "#009ee3" }}
        >
          {connectLoading ? "Redirigiendo…" : "Conectar MercadoPago"}
        </button>
      )}

      {/* Paseos */}
      <div className="flex flex-col gap-4">
        <h2 className="text-base font-serif font-bold text-brand-text">Mis paseos</h2>

        {actionError && (
          <div className="text-sm px-4 py-3 rounded-xl bg-red-50 text-red-700 border border-red-200">
            {actionError}
          </div>
        )}

        {/* Pendientes — acción requerida */}
        {pendingWalks.length > 0 && (
          <div className="flex flex-col gap-3">
            <p className="text-xs font-semibold text-brand-text-muted uppercase tracking-wide">
              Requieren confirmación
            </p>
            {pendingWalks.map((walk) => {
              const dateStr = new Date(walk.scheduledAt).toLocaleString("es-AR", {
                dateStyle: "long",
                timeStyle: "short",
              });
              const first = walk.participants[0];
              const dogName   = first?.dog.name ?? "—";
              const ownerName = first
                ? `${first.owner.user.firstName} ${first.owner.user.lastName}`
                : "—";
              const isActioning = actioning === walk.id;

              return (
                <div
                  key={walk.id}
                  className="bg-brand-surface rounded-2xl p-4 shadow-card border border-brand-primary/30 flex flex-col gap-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-sm font-semibold text-brand-text-body">
                        {walk.walkType.label}
                      </span>
                      <span className="text-xs text-brand-text-muted">{dateStr}</span>
                    </div>
                    <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 shrink-0">
                      Pendiente
                    </span>
                  </div>
                  <div className="text-xs text-brand-text-muted flex gap-4">
                    <span>Perro: <strong className="text-brand-text-body">{dogName}</strong></span>
                    <span>Dueño: <strong className="text-brand-text-body">{ownerName}</strong></span>
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={() => handleConfirm(walk.id)}
                      disabled={!!actioning}
                      className="flex-1 h-9 rounded-xl bg-brand-primary text-white text-sm font-semibold disabled:opacity-40 transition-opacity hover:opacity-90"
                    >
                      {isActioning ? "…" : "Confirmar"}
                    </button>
                    <button
                      onClick={() => handleReject(walk.id)}
                      disabled={!!actioning}
                      className="flex-1 h-9 rounded-xl border border-brand-border text-brand-text-muted text-sm font-semibold disabled:opacity-40 transition-opacity hover:opacity-70"
                    >
                      {isActioning ? "…" : "Rechazar"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Resto de paseos */}
        {otherWalks.length > 0 && (
          <div className="flex flex-col gap-2">
            {pendingWalks.length > 0 && (
              <p className="text-xs font-semibold text-brand-text-muted uppercase tracking-wide">
                Historial
              </p>
            )}
            {otherWalks.map((walk) => {
              const dateStr = new Date(walk.scheduledAt).toLocaleString("es-AR", {
                dateStyle: "long",
                timeStyle: "short",
              });
              const first = walk.participants[0];
              const dogName = first?.dog.name ?? "—";
              return (
                <div
                  key={walk.id}
                  className="bg-brand-surface rounded-2xl p-4 border border-brand-border flex flex-col gap-1"
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
                  <p className="text-xs text-brand-text-muted">Perro: {dogName}</p>
                </div>
              );
            })}
          </div>
        )}

        {walks.length === 0 && (
          <div className="flex items-center justify-center rounded-3xl border border-dashed border-brand-border min-h-40">
            <p className="text-sm text-brand-text-muted">
              Todavía no tenés paseos asignados.
            </p>
          </div>
        )}
      </div>

    </main>
  );
}
