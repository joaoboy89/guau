"use client";

import { useEffect, useState } from "react";
import { useRequireAuth } from "@/lib/auth";
import { walkersAPI, paymentsAPI, walksAPI } from "@/lib/api";
import {
  STATUS_LABEL,
  STATUS_VARIANT,
  canCancelWalk,
  isActiveWalk,
  nextWalkAction,
  walkActionAvailability,
  type WalkTransition,
} from "@/lib/walk-status";
import { formatDateTimeBA, formatTimeBA, isTodayBA } from "@/lib/format-date";
import { DAY_LABELS } from "@/lib/schedule";
import { findNearestBarrio, type Barrio } from "@/lib/barrios";
import BarrioSelect from "@/components/BarrioSelect";
import { Badge, Button } from "@/components/ui";
import CancelWalkDialog from "@/components/CancelWalkDialog";
import ConfirmDialog from "@/components/ConfirmDialog";
import StartWalkDialog from "@/components/StartWalkDialog";
import { AxiosError } from "axios";
import { START_WITHOUT_CODE_REASON, type StartWithoutCodeReason } from "@guau/shared";

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
  startedAt: string | null;
  isPaid: boolean;
  isExpired: boolean;
  walkType: { label: string; durationMinutes: number };
  participants: Array<{
    dog:   { name: string };
    owner: { user: { firstName: string; lastName: string } };
  }>;
}

interface WalksMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  days: number;
}

// Combina dos listas de walks por id (último gana) y reordena por fecha —
// necesario porque el historial se arma con datos de dos llamadas distintas
// (pendientes vencidos + páginas del historial) que pueden resolver en
// cualquier orden.
function mergeWalksById(a: WalkItem[], b: WalkItem[]): WalkItem[] {
  const map = new Map(a.map((w) => [w.id, w]));
  for (const w of b) map.set(w.id, w);
  return Array.from(map.values()).sort(
    (x, y) => new Date(y.scheduledAt).getTime() - new Date(x.scheduledAt).getTime()
  );
}

// Los activos se ordenan al reves que el historial: lo que viene primero va
// arriba. En el historial la pregunta es "que paso recien"; en los activos,
// "que tengo que hacer ahora".
function sortByScheduledAsc(walks: WalkItem[]): WalkItem[] {
  return [...walks].sort(
    (a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()
  );
}

// Un paseo activo es el que todavia tiene una accion pendiente del paseador
// (CONFIRMED / WALKER_ON_WAY / IN_PROGRESS). Deliberadamente NO se mira
// `isExpired`: es `scheduledAt <= now`, asi que marca vencido a todo paseo en
// curso — filtrarlo por ahi le sacaria el boton al paseador exactamente
// mientras trabaja.
function splitActive(items: WalkItem[]): { active: WalkItem[]; past: WalkItem[] } {
  const active: WalkItem[] = [];
  const past:   WalkItem[] = [];
  for (const w of items) (isActiveWalk(w.status) ? active : past).push(w);
  return { active, past };
}

// "start" no vive acá: desde el bloque D1 siempre necesita un body (código o
// motivo), así que handleWalkAction lo intercepta antes de llegar a este
// mapa — dejarlo con la firma vieja (solo id) rompería la llamada real a
// walksAPI.start, que ahora exige el segundo parámetro.
const TRANSITION_CALL: Record<Exclude<WalkTransition, "start">, (id: string) => Promise<unknown>> = {
  onWay:  walksAPI.onWay,
  finish: walksAPI.finish,
};

const TRANSITION_ERROR: Record<WalkTransition, string> = {
  onWay:  "No se pudo avisar que vas en camino. Intentá de nuevo.",
  start:  "No se pudo iniciar el paseo. Intentá de nuevo.",
  finish: "No se pudo finalizar el paseo. Intentá de nuevo.",
};

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

  // "Requieren confirmación" y el historial son dos preguntas distintas que
  // comparten un endpoint por casualidad: si se pidieran con una sola
  // llamada paginada, un PENDING que cayera fuera de la primera página
  // desaparecería de "Requieren confirmación" y el dueño se quedaría
  // esperando una respuesta que nunca llega. Por eso son dos llamadas: los
  // pendientes (sin límite de fecha, siempre completos) y el historial
  // (paginado, ventana de 30 días).
  const [pendingWalks, setPendingWalks] = useState<WalkItem[]>([]);
  // Tercera seccion, no una vista del historial: un CONFIRMED dejo de ser
  // algo que ya paso — significa que el paseador tiene que salir.
  const [activeWalks, setActiveWalks]   = useState<WalkItem[]>([]);
  const [historyWalks, setHistoryWalks] = useState<WalkItem[]>([]);
  const [historyMeta, setHistoryMeta]   = useState<WalksMeta | null>(null);
  const [loadingMoreHistory, setLoadingMoreHistory] = useState(false);
  const [actioning, setActioning]   = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Reevalua la disponibilidad de los botones de accion cada 30s mientras
  // haya al menos un paseo activo. Sin esto, el paseador parado en la puerta
  // a T-6m ve "Iniciar paseo" apagado hasta que recarga la pagina a mano —
  // friccion en el peor momento, con el dueño y el perro esperando. Nada de
  // polling al servidor: solo se vuelve a mirar el reloj local y redibuja.
  const [nowTick, setNowTick] = useState(() => new Date());

  const [finishDialogWalkId, setFinishDialogWalkId] = useState<string | null>(null);
  const [finishError, setFinishError] = useState<string | null>(null);

  // Código de retiro (bloque D1) — "Iniciar paseo" ya no dispara directo,
  // abre este diálogo. mode arranca siempre en "code": el camino sin código
  // es una salida DESDE ahí, no una elección previa.
  const [startDialogWalkId, setStartDialogWalkId] = useState<string | null>(null);
  const [startMode, setStartMode]                 = useState<"code" | "reason">("code");
  const [startCode, setStartCode]                 = useState("");
  const [startReason, setStartReason]              = useState<StartWithoutCodeReason | "">("");
  const [startOtherReason, setStartOtherReason]    = useState("");
  const [startError, setStartError]                = useState<string | null>(null);

  const [cancelDialogWalkId, setCancelDialogWalkId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelError, setCancelError] = useState<string | null>(null);

  const [zoneSaving, setZoneSaving] = useState(false);
  const [zoneError, setZoneError]   = useState<string | null>(null);
  const [barrio, setBarrio]         = useState<Barrio | null>(null);
  // 3 es el tope del rango permitido, no un valor arbitrario: ver el rango
  // de radiusKm más abajo.
  const [radiusInput, setRadiusInput] = useState(3);

  const [days, setDays] = useState<DayRow[]>(buildDefaultDays());
  const [schedulesSaving, setSchedulesSaving] = useState(false);

  // Dos llamadas, no una: PENDING sin filtro de fecha (siempre completos) y
  // el historial paginado (30 días por defecto). Los PENDING vencidos que
  // trae la primera llamada se descartan de "Requieren confirmación" y se
  // suman al historial — confirmar un paseo cuya fecha ya pasó no tiene
  // sentido, pero siguen siendo parte de lo que pasó.
  const fetchWalks = async () => {
    const [pendingRes, historyRes] = await Promise.all([
      walksAPI.list({ status: "PENDING" }),
      walksAPI.list(),
    ]);
    const pendingItems: WalkItem[] = pendingRes.data.data;
    const expired = pendingItems.filter((w) => w.isExpired);
    setPendingWalks(pendingItems.filter((w) => !w.isExpired));

    const rest: WalkItem[] = historyRes.data.data.filter(
      (w: WalkItem) => w.status !== "PENDING"
    );
    const { active, past } = splitActive(rest);
    setActiveWalks(sortByScheduledAsc(active));
    setHistoryWalks(mergeWalksById(past, expired));
    setHistoryMeta(historyRes.data.meta);
  };

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
    fetchWalks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  const handleLoadMoreHistory = async () => {
    if (!historyMeta || loadingMoreHistory) return;
    const nextPage = historyMeta.page + 1;
    if (nextPage > historyMeta.totalPages) return;
    setLoadingMoreHistory(true);
    try {
      const res = await walksAPI.list({ page: nextPage });
      const items: WalkItem[] = res.data.data.filter((w: WalkItem) => w.status !== "PENDING");
      // Los activos caen en la primera pagina por el orden descendente, pero
      // se separan igual en cada una: si alguno aparece mas abajo tiene que ir
      // a su seccion, no al historial.
      const { active, past } = splitActive(items);
      setActiveWalks((prev) => sortByScheduledAsc(mergeWalksById(prev, active)));
      setHistoryWalks((prev) => mergeWalksById(prev, past));
      setHistoryMeta(res.data.meta);
    } finally {
      setLoadingMoreHistory(false);
    }
  };

  useEffect(() => {
    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        setConnectLoading(false);
      }
    };
    window.addEventListener("pageshow", handlePageShow);
    return () => window.removeEventListener("pageshow", handlePageShow);
  }, []);

  useEffect(() => {
    if (activeWalks.length === 0) return;
    const id = setInterval(() => setNowTick(new Date()), 30_000);
    return () => clearInterval(id);
  }, [activeWalks.length]);

  const toggleAvailability = async () => {
    if (!profile || toggling) return;
    setToggling(true);
    setAvailError(null);
    const next = !available;
    try {
      await walkersAPI.updateAvailability({ isAvailable: next });
      setAvailable(next);
    } catch (err: unknown) {
      // Mismo patron que zoneError/wallet: el servidor ya dice que paso (ej.
      // "Solo paseadores verificados pueden activar su disponibilidad") mejor
      // de lo que podriamos traducir a mano desde un status. La unica rama
      // que hace falta agregar es la que ningun patron cubria: sin status no
      // hay respuesta que leer, la request no llego a destino.
      const axiosErr = err as AxiosError<{ message: string }>;
      if (!axiosErr?.response?.status) {
        setAvailError("No pudimos conectarnos. Revisá tu conexión e intentá de nuevo.");
      } else {
        const msg = axiosErr.response?.data?.message;
        setAvailError(msg ?? "No se pudo actualizar la disponibilidad. Intentá de nuevo.");
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

  /**
   * Todas las transiciones pasan por aca, y todas terminan refrescando desde
   * el servidor.
   *
   * `handleConfirm` y `handleReject` mutaban el estado local a mano
   * (`setHistoryWalks(prev => ...)` con el status escrito del lado del
   * cliente). Con dos transiciones eso todavia se sostenia; con cinco, el
   * estado local y el del backend se despegan enseguida — y el bug que sale
   * de ahi, una tarjeta mostrando un estado que el backend no tiene, es de
   * los mas dificiles de reproducir. Una request de mas por accion es barata
   * al lado de eso.
   *
   * Devuelve si la transicion salio bien, para que quien abrio un dialogo
   * sepa si cerrarlo.
   */
  const runWalkAction = async (
    walkId: string,
    call: () => Promise<unknown>,
    fallbackMsg: string,
    onError: (msg: string) => void,
  ): Promise<boolean> => {
    if (actioning) return false;
    setActioning(walkId);
    try {
      await call();
      await fetchWalks();
      return true;
    } catch (err: unknown) {
      const msg = (err as AxiosError<{ message: string }>)?.response?.data?.message;
      onError(msg ?? fallbackMsg);
      return false;
    } finally {
      setActioning(null);
    }
  };

  const handleConfirm = (walkId: string) => {
    setActionError(null);
    void runWalkAction(
      walkId,
      () => walksAPI.confirm(walkId),
      "No se pudo confirmar el paseo. Intentá de nuevo.",
      setActionError,
    );
  };

  const handleReject = (walkId: string) => {
    setActionError(null);
    void runWalkAction(
      walkId,
      () => walksAPI.reject(walkId),
      "No se pudo rechazar el paseo. Intentá de nuevo.",
      setActionError,
    );
  };

  // Un solo boton por tarjeta y el estado decide cual: nextWalkAction devuelve
  // la unica transicion disponible. "Finalizar" abre dialogo porque COMPLETED
  // es terminal; "Iniciar" abre el diálogo del código (bloque D1) — nunca
  // dispara directo, a diferencia de onWay.
  const handleWalkAction = (walk: WalkItem) => {
    const next = nextWalkAction(walk.status);
    if (!next) return;
    if (next.action === "start") {
      setStartError(null);
      setStartMode("code");
      setStartCode("");
      setStartReason("");
      setStartOtherReason("");
      setStartDialogWalkId(walk.id);
      return;
    }
    if (next.needsConfirm) {
      setFinishError(null);
      setFinishDialogWalkId(walk.id);
      return;
    }
    // Copiado a una const: la estrechez de tipo de `next.action !== "start"`
    // no sobrevive dentro de la closure de abajo si se sigue leyendo como
    // propiedad de `next` (TS no puede garantizar que no cambie antes de que
    // la closure corra). Una const sí la conserva.
    const action = next.action;
    setActionError(null);
    void runWalkAction(
      walk.id,
      () => TRANSITION_CALL[action](walk.id),
      TRANSITION_ERROR[action],
      setActionError,
    );
  };

  const dismissFinishDialog = () => {
    if (actioning) return;
    setFinishDialogWalkId(null);
    setFinishError(null);
  };

  const handleFinishConfirm = async () => {
    if (!finishDialogWalkId) return;
    setFinishError(null);
    const ok = await runWalkAction(
      finishDialogWalkId,
      () => walksAPI.finish(finishDialogWalkId),
      TRANSITION_ERROR.finish,
      setFinishError,
    );
    if (ok) setFinishDialogWalkId(null);
  };

  const dismissStartDialog = () => {
    if (actioning) return;
    setStartDialogWalkId(null);
    setStartMode("code");
    setStartCode("");
    setStartReason("");
    setStartOtherReason("");
    setStartError(null);
  };

  const handleStartSubmit = async () => {
    if (!startDialogWalkId) return;
    setStartError(null);
    const payload =
      startMode === "code"
        ? { pickupCode: startCode }
        : startReason === START_WITHOUT_CODE_REASON.OTHER
        ? { reason: startReason, otherReason: startOtherReason.trim() }
        : { reason: startReason };

    const ok = await runWalkAction(
      startDialogWalkId,
      () => walksAPI.start(startDialogWalkId, payload),
      TRANSITION_ERROR.start,
      setStartError,
    );
    if (ok) dismissStartDialog();
  };

  const dismissCancelDialog = () => {
    if (actioning) return;
    setCancelDialogWalkId(null);
    setCancelReason("");
    setCancelError(null);
  };

  const handleCancel = async (walkId: string) => {
    setCancelError(null);
    const ok = await runWalkAction(
      walkId,
      () =>
        walksAPI.cancel(
          walkId,
          cancelReason.trim() ? { cancellationReason: cancelReason.trim() } : undefined
        ),
      "No se pudo cancelar la reserva. Intentá de nuevo.",
      setCancelError,
    );
    if (ok) {
      setCancelDialogWalkId(null);
      setCancelReason("");
    }
  };

  if (!ready || !profile) return null;

  const badge    = BADGE[profile.verificationStatus];
  const fullName = `${profile.user.firstName} ${profile.user.lastName}`;

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
        <h2 id="mis-paseos" tabIndex={-1} className="text-base font-serif font-bold text-brand-text">Mis paseos</h2>

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
              const dateStr = formatDateTimeBA(new Date(walk.scheduledAt));
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

        {/* Paseos activos — lo unico de esta pantalla que es trabajo por
            hacer ahora. Antes vivian mezclados en el historial y sin ninguna
            accion: por eso ningun paseo llego nunca a COMPLETED. */}
        {activeWalks.length > 0 && (
          <div className="flex flex-col gap-3">
            <p className="text-xs font-semibold text-brand-text-muted uppercase tracking-wide">
              Paseos activos
            </p>
            {activeWalks.map((walk) => {
              const dateStr = formatDateTimeBA(new Date(walk.scheduledAt));
              const first     = walk.participants[0];
              const dogName   = first?.dog.name ?? "—";
              const ownerName = first
                ? `${first.owner.user.firstName} ${first.owner.user.lastName}`
                : "—";
              const next        = nextWalkAction(walk.status);
              const availability = next
                ? walkActionAvailability(next.action, {
                    scheduledAt: new Date(walk.scheduledAt),
                    startedAt: walk.startedAt ? new Date(walk.startedAt) : null,
                    durationMinutes: walk.walkType.durationMinutes,
                    now: nowTick,
                  })
                : null;
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
                    <Badge variant={STATUS_VARIANT[walk.status] ?? "default"} className="shrink-0">
                      {STATUS_LABEL[walk.status] ?? walk.status}
                    </Badge>
                  </div>
                  <div className="text-xs text-brand-text-muted flex gap-4">
                    <span>Perro: <strong className="text-brand-text-body">{dogName}</strong></span>
                    <span>Dueño: <strong className="text-brand-text-body">{ownerName}</strong></span>
                  </div>
                  <div className="flex gap-2 pt-1">
                    {next && (
                      <div className="flex-1 flex flex-col gap-1">
                        <Button
                          size="sm"
                          className="w-full"
                          onClick={() => handleWalkAction(walk)}
                          disabled={!!actioning || !(availability?.available ?? false)}
                          loading={isActioning}
                        >
                          {next.label}
                        </Button>
                        {/* Boton visible pero apagado desde que el paseo entra
                            en el estado que lo habilita, no solo desde que se
                            abre la ventana — asi el paseador ve que tiene algo
                            pendiente y sabe cuando va a poder, en vez de una
                            tarjeta muda de la que brota un boton de golpe. */}
                        {availability && !availability.available && availability.availableAt && (
                          <span className="text-xs text-brand-text-muted text-center">
                            {/* Un paseo de hoy solo necesita la hora; uno de otro
                                dia sin fecha se lee como si fuera hoy — asi fue
                                el bug real en staging: "a las 8:15" para un
                                paseo agendado nueve dias despues. */}
                            {isTodayBA(availability.availableAt)
                              ? `Se habilita a las ${formatTimeBA(availability.availableAt)}`
                              : `Se habilita el ${formatDateTimeBA(availability.availableAt)}`}
                          </span>
                        )}
                      </div>
                    )}
                    {/* Cancelar sigue apareciendo donde ya aparecia: CONFIRMED
                        sin pagar. Un paseo ya arrancado no se cancela — el
                        backend tampoco lo permite. */}
                    {canCancelWalk(walk.status, walk.isPaid) && (
                      <Button
                        variant="secondary"
                        size="sm"
                        className="flex-1"
                        onClick={() => setCancelDialogWalkId(walk.id)}
                        disabled={!!actioning}
                      >
                        Cancelar
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Historial */}
        {historyWalks.length > 0 && (
          <div className="flex flex-col gap-2">
            {(pendingWalks.length > 0 || activeWalks.length > 0) && (
              <p className="text-xs font-semibold text-brand-text-muted uppercase tracking-wide">
                Historial
              </p>
            )}
            {historyWalks.map((walk) => {
              const dateStr = formatDateTimeBA(new Date(walk.scheduledAt));
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
                    {/* Pasa a Badge con STATUS_VARIANT recien ahora porque
                        recien ahora importa: hasta hoy el historial del
                        paseador solo podia tener cancelados, y pintarlos a
                        todos del mismo terracota daba igual. Con COMPLETED
                        alcanzable por primera vez, "completado" y "cancelado"
                        no pueden verse iguales. */}
                    <Badge variant={STATUS_VARIANT[walk.status] ?? "default"} className="shrink-0">
                      {STATUS_LABEL[walk.status] ?? walk.status}
                    </Badge>
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

            {historyMeta && historyMeta.page < historyMeta.totalPages && (
              <Button
                variant="secondary"
                size="sm"
                className="w-fit self-center mt-1"
                onClick={handleLoadMoreHistory}
                loading={loadingMoreHistory}
              >
                Cargar más
              </Button>
            )}

            {historyMeta && (
              <p className="text-xs text-brand-text-muted text-center mt-1">
                Mostrando tus paseos de los últimos {historyMeta.days} días.
              </p>
            )}
          </div>
        )}

        {pendingWalks.length === 0 && activeWalks.length === 0 && historyWalks.length === 0 && (
          <div className="flex items-center justify-center rounded-3xl border border-dashed border-brand-border min-h-40">
            <p className="text-sm text-brand-text-muted">
              Todavía no tenés paseos asignados.
            </p>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={finishDialogWalkId !== null}
        title="¿Terminaste el paseo?"
        description="El dueño recibe el aviso de paseo completado. No se puede deshacer."
        confirmLabel="Si, finalizar"
        onDismiss={dismissFinishDialog}
        onConfirm={handleFinishConfirm}
        confirming={actioning === finishDialogWalkId}
        error={finishError}
        fallbackFocusId="mis-paseos"
      />

      <StartWalkDialog
        open={startDialogWalkId !== null}
        mode={startMode}
        onModeChange={setStartMode}
        code={startCode}
        onCodeChange={setStartCode}
        reason={startReason}
        onReasonChange={setStartReason}
        otherReason={startOtherReason}
        onOtherReasonChange={setStartOtherReason}
        onDismiss={dismissStartDialog}
        onSubmit={handleStartSubmit}
        submitting={actioning === startDialogWalkId}
        error={startError}
      />

      <CancelWalkDialog
        open={cancelDialogWalkId !== null}
        reason={cancelReason}
        onReasonChange={setCancelReason}
        onDismiss={dismissCancelDialog}
        onConfirm={() => cancelDialogWalkId && handleCancel(cancelDialogWalkId)}
        confirming={actioning === cancelDialogWalkId}
        error={cancelError}
      />
    </main>
  );
}
