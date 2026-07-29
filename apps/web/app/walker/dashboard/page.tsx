"use client";

import { useEffect, useState } from "react";
import { useRequireAuth } from "@/lib/auth";
import { walkersAPI, paymentsAPI, walksAPI } from "@/lib/api";
import { STATUS_LABEL, canCancelWalk } from "@/lib/walk-status";
import { DAY_LABELS } from "@/lib/schedule";
import { findNearestBarrio, type Barrio } from "@/lib/barrios";
import BarrioSelect from "@/components/BarrioSelect";
import { Button } from "@/components/ui";
import CancelWalkDialog from "@/components/CancelWalkDialog";
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
  error:      string | null;
  // Última versión persistida de esta fila. Compararla contra los campos de
  // arriba es lo que dice si la fila tiene cambios sin guardar.
  original: { active: boolean; startTime: string; endTime: string };
}

function buildDefaultDays(): DayRow[] {
  return DAY_LABELS.map((_, dayOfWeek) => ({
    dayOfWeek,
    scheduleId: null,
    active:     false,
    startTime:  "09:00",
    endTime:    "18:00",
    error:      null,
    original:   { active: false, startTime: "09:00", endTime: "18:00" },
  }));
}

function isDayDirty(row: DayRow): boolean {
  if (row.active !== row.original.active) return true;
  if (row.active && (row.startTime !== row.original.startTime || row.endTime !== row.original.endTime)) {
    return true;
  }
  return false;
}

interface WalkItem {
  id: string;
  status: string;
  scheduledAt: string;
  isPaid: boolean;
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

  const [cancelDialogWalkId, setCancelDialogWalkId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState("");

  const [zoneSaving, setZoneSaving] = useState(false);
  const [zoneError, setZoneError]   = useState<string | null>(null);
  const [barrio, setBarrio]         = useState<Barrio | null>(null);
  // 3 es el tope del rango permitido, no un valor arbitrario: ver el rango
  // de radiusKm más abajo.
  const [radiusInput, setRadiusInput] = useState(3);

  const [days, setDays] = useState<DayRow[]>(buildDefaultDays());
  const [schedulesSaving, setSchedulesSaving] = useState(false);

  useEffect(() => {
    if (!ready) return;
    walkersAPI.myProfile().then((res) => {
      const p: WalkerProfile = res.data;
      setProfile(p);
      setAvailable(p.isAvailable);
      if (p.centerLat != null && p.centerLng != null) {
        setBarrio(findNearestBarrio(p.centerLat, p.centerLng));
      }
      setRadiusInput(p.radiusKm != null && p.radiusKm >= 1 && p.radiusKm <= 3 ? p.radiusKm : 3);
      setDays((prev) =>
        prev.map((row) => {
          const match = p.schedules.find((s) => s.dayOfWeek === row.dayOfWeek);
          if (!match) return row;
          const loaded = { active: true, startTime: match.startTime, endTime: match.endTime };
          return { ...row, scheduleId: match.id, ...loaded, original: loaded };
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

  // Un solo "Guardar horarios" para toda la semana, no uno por día: con un
  // botón por fila, activar tres días y guardar solo dos era una pérdida de
  // datos silenciosa — el tercero no persistía y nadie se enteraba. Acá se
  // mandan en paralelo únicamente las requests de los días con cambios sin
  // guardar (como mucho 7, y son las mismas que ya existían por fila) y, si
  // alguna falla, el error queda en la fila de ese día puntual sin bloquear
  // el resto.
  const handleSaveSchedules = async () => {
    const dirtyRows = days.filter(isDayDirty);
    if (dirtyRows.length === 0 || schedulesSaving) return;

    setSchedulesSaving(true);
    setDays((prev) => prev.map((row) => (isDayDirty(row) ? { ...row, error: null } : row)));

    const results = await Promise.allSettled(
      dirtyRows.map(async (row) => {
        if (row.active && row.startTime >= row.endTime) {
          throw new Error("La hora de inicio debe ser antes que la de fin");
        }
        if (row.active) {
          if (row.scheduleId) {
            await walkersAPI.updateSchedule(row.scheduleId, {
              startTime: row.startTime,
              endTime:   row.endTime,
              isActive:  true,
            });
            return row.scheduleId;
          }
          const res = await walkersAPI.createSchedule({
            dayOfWeek: row.dayOfWeek,
            startTime: row.startTime,
            endTime:   row.endTime,
          });
          return res.data.id as string;
        }
        if (row.scheduleId) {
          await walkersAPI.updateSchedule(row.scheduleId, { isActive: false });
        }
        return row.scheduleId;
      })
    );

    setDays((prev) =>
      prev.map((row) => {
        const idx = dirtyRows.findIndex((d) => d.dayOfWeek === row.dayOfWeek);
        if (idx === -1) return row;
        const result = results[idx];
        if (result.status === "fulfilled") {
          return {
            ...row,
            scheduleId: result.value,
            original:   { active: row.active, startTime: row.startTime, endTime: row.endTime },
          };
        }
        const msg = (result.reason as AxiosError<{ message: string }>)?.response?.data?.message;
        return { ...row, error: msg ?? (result.reason as Error)?.message ?? "No se pudo guardar. Intentá de nuevo." };
      })
    );
    setSchedulesSaving(false);
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

  const dismissCancelDialog = () => {
    if (actioning) return;
    setCancelDialogWalkId(null);
    setCancelReason("");
  };

  const handleCancel = async (walkId: string) => {
    if (actioning) return;
    setActioning(walkId);
    setActionError(null);
    try {
      await walksAPI.cancel(
        walkId,
        cancelReason.trim() ? { cancellationReason: cancelReason.trim() } : undefined
      );
      // Se refresca desde el servidor, no se muta el estado local a mano.
      const res = await walksAPI.list();
      setWalks(res.data);
      setCancelDialogWalkId(null);
      setCancelReason("");
    } catch (err: unknown) {
      const msg = (err as AxiosError<{ message: string }>)?.response?.data?.message;
      setActionError(msg ?? "No se pudo cancelar la reserva. Intentá de nuevo.");
    } finally {
      setActioning(null);
    }
  };

  if (!ready || !profile) return null;

  const badge    = BADGE[profile.verificationStatus];
  const fullName = `${profile.user.firstName} ${profile.user.lastName}`;

  const pendingWalks = walks.filter((w) => w.status === "PENDING");
  const otherWalks   = walks.filter((w) => w.status !== "PENDING");

  const hasZone         = profile.centerLat != null && profile.centerLng != null && profile.radiusKm != null;
  const hasUnsavedDays   = days.some(isDayDirty);

  // Un solo aviso en vez de tres apilados: la lista muestra solo lo que
  // realmente falta, en el orden en que aparecen las secciones de abajo.
  const missingItems: Array<{ text: string; anchor?: string }> = [];
  if (profile.verificationStatus === "PENDING") {
    missingItems.push({ text: "Que verifiquemos tu cuenta" });
  }
  if (profile.schedules.length === 0) {
    missingItems.push({ text: "Cargar tus horarios", anchor: "#horarios" });
  }
  if (!hasZone) {
    missingItems.push({ text: "Configurar tu zona de trabajo" });
  }

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

      {/* Un solo bloque de advertencia — antes eran tres (verificación,
          horarios, zona) apilados, y con todo gritando nada se destacaba. */}
      {missingItems.length > 0 && (
        <div className="flex flex-col gap-1.5 px-4 py-3 rounded-2xl bg-amber-50 border border-amber-200">
          <p className="text-sm font-semibold text-amber-800">
            Para empezar a recibir paseos te falta:
          </p>
          <ul className="flex flex-col gap-0.5 pl-4 list-disc text-sm text-amber-800">
            {missingItems.map((item) => (
              <li key={item.text}>
                {item.anchor ? (
                  <a href={item.anchor} className="underline underline-offset-2">
                    {item.text}
                  </a>
                ) : (
                  item.text
                )}
              </li>
            ))}
          </ul>
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

        <BarrioSelect
          value={barrio?.nombre ?? ""}
          onChange={setBarrio}
          label="¿En qué barrio querés trabajar?"
        />

        {/*
          20 km era un valor de prueba, no una decisión de producto: nadie
          camina perros a 20 km de su zona. 1-3 km es lo que razonablemente
          cubre a alguien que se mueve a pie (ver SetZoneDto en el backend,
          que es quien realmente lo hace cumplir). El control es un
          desplegable de tres opciones, no un número libre: no hay nada
          entre 1 y 3 que tenga sentido ofrecer.

          La fila se apila siempre (nunca lado a lado con el botón): en
          mobile, el label "¿Hasta dónde estás dispuesto a ir a buscar un
          perro?" no se dejaba encoger dentro de un flex horizontal, la fila
          desbordaba y el botón de guardar quedaba montado encima del texto.
        */}
        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-brand-text-body">
            ¿Hasta dónde estás dispuesto a ir a buscar un perro?
          </span>
          <select
            value={radiusInput}
            onChange={(e) => setRadiusInput(Number(e.target.value))}
            className="h-12 w-full sm:w-40 rounded-2xl border border-brand-border bg-brand-surface px-4 text-brand-text transition-colors duration-150 hover:border-brand-text-muted focus:outline-none focus:ring-2 focus:ring-brand-primary focus:border-transparent"
          >
            <option value={1}>1 km</option>
            <option value={2}>2 km</option>
            <option value={3}>3 km</option>
          </select>
        </label>

        <Button onClick={handleSaveZone} disabled={!barrio} loading={zoneSaving} fullWidth>
          Guardar zona
        </Button>

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

        <Button onClick={handleSaveSchedules} disabled={!hasUnsavedDays} loading={schedulesSaving} fullWidth>
          Guardar horarios
        </Button>
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
          <Button variant="ghost" size="sm" onClick={connectMercadoPago} loading={connectLoading}>
            Reconectar
          </Button>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3 px-4 py-4 rounded-2xl bg-brand-surface border border-brand-border">
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-semibold text-brand-text-body">MercadoPago</span>
            <span className="text-xs text-brand-text-muted">
              Conectá tu cuenta para poder cobrar los paseos.
            </span>
          </div>
          {/* #009ee3 es color de marca de MercadoPago, no de Güau — se
              respeta sobre el primitivo Button en vez de duplicar sus
              estilos a mano. */}
          <Button
            size="sm"
            onClick={connectMercadoPago}
            loading={connectLoading}
            style={{ backgroundColor: "#009ee3" }}
          >
            Conectar
          </Button>
        </div>
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
                  className="bg-brand-surface rounded-2xl p-4 border border-brand-primary/30 flex flex-col gap-3"
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
                    <Button
                      size="sm"
                      className="flex-1"
                      onClick={() => handleConfirm(walk.id)}
                      disabled={!!actioning}
                      loading={isActioning}
                    >
                      Confirmar
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="flex-1"
                      onClick={() => handleReject(walk.id)}
                      disabled={!!actioning}
                      loading={isActioning}
                    >
                      Rechazar
                    </Button>
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

                  {/* Cancelar — solo CONFIRMED sin pagar. Un PENDING ya tiene
                      Rechazar arriba (mismo efecto neto); un paseo pagado no
                      se puede cancelar desde la app todavía. */}
                  {canCancelWalk(walk.status, walk.isPaid) && (
                    <Button
                      variant="secondary"
                      size="sm"
                      className="mt-2 w-fit"
                      onClick={() => setCancelDialogWalkId(walk.id)}
                    >
                      Cancelar reserva
                    </Button>
                  )}
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

      <CancelWalkDialog
        open={cancelDialogWalkId !== null}
        reason={cancelReason}
        onReasonChange={setCancelReason}
        onDismiss={dismissCancelDialog}
        onConfirm={() => cancelDialogWalkId && handleCancel(cancelDialogWalkId)}
        confirming={actioning === cancelDialogWalkId}
        error={actionError}
      />
    </main>
  );
}
