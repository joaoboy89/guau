"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useRequireAuth } from "@/lib/auth";
import { dogsAPI, walkTypesAPI, walkersAPI, walksAPI } from "@/lib/api";
import { toDatetimeLocalValue } from "@/lib/datetime";
import { summarizeSchedule } from "@/lib/schedule";
import { cn } from "@/lib/cn";
import BarrioSelect from "@/components/BarrioSelect";
import { Container, Card, Input, Button } from "@/components/ui";
import type { Barrio } from "@/lib/barrios";
import { AxiosError } from "axios";

interface Dog {
  id: string;
  name: string;
  size: string;
}

interface WalkType {
  id: string;
  label: string;
  basePrice: number;
  durationMinutes: number;
  exclusiveMultiplier: number;
}

interface Walker {
  id: string;
  bio: string | null;
  rating: number | null;
  // Solo nombre de pila — el backend no devuelve apellido en respuestas públicas.
  user: { firstName: string };
}

interface WalkerScheduleSlot {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
}

type Step = "dog" | "type" | "walker" | "details";

export default function NewWalkPage() {
  const { ready } = useRequireAuth();
  const router = useRouter();

  const [step, setStep] = useState<Step>("dog");

  // ── Perros ──
  const [dogs, setDogs] = useState<Dog[]>([]);
  const [selectedDogId, setSelectedDogId] = useState<string>("");
  const [dogName, setDogName] = useState("");
  const [dogSize, setDogSize] = useState<"small" | "medium" | "large">("medium");
  const [addingDog, setAddingDog] = useState(false);
  const [dogError, setDogError] = useState<string | null>(null);

  // ── Walk types ──
  const [walkTypes, setWalkTypes] = useState<WalkType[]>([]);
  const [selectedTypeId, setSelectedTypeId] = useState<string>("");

  // ── Barrio (alimenta la búsqueda de paseadores y el pickup) ──
  // PROVISIONAL hasta integrar geocodificación real con Mapbox: usamos el
  // centroide del barrio elegido en vez de la dirección exacta que escribe
  // el dueño más abajo (ver lib/barrios.ts).
  const [barrio, setBarrio] = useState<Barrio | null>(null);

  // ── Walkers ──
  const [walkers, setWalkers] = useState<Walker[]>([]);
  const [selectedWalkerId, setSelectedWalkerId] = useState<string>("");
  const [selectedWalkerSchedule, setSelectedWalkerSchedule] = useState<WalkerScheduleSlot[] | null>(null);
  const [scheduleLoading, setScheduleLoading] = useState(false);

  // ── Detalles ──
  const [scheduledAt, setScheduledAt] = useState("");
  const [pickupAddress, setPickupAddress] = useState("");
  // Se calcula en un efecto (no en el render) para no hornear la hora del build
  // en el HTML estático y quedar desactualizado — siempre refleja el "ahora" real.
  const [minScheduledAt, setMinScheduledAt] = useState("");

  useEffect(() => {
    setMinScheduledAt(toDatetimeLocalValue(new Date()));
  }, []);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // ── Carga inicial ──
  useEffect(() => {
    if (!ready) return;
    dogsAPI.list().then((res) => {
      const list: Dog[] = res.data;
      setDogs(list);
      if (list.length === 1) setSelectedDogId(list[0].id);
    });
    walkTypesAPI.list().then((res) => setWalkTypes(res.data));
  }, [ready]);

  // Busca paseadores recién cuando hay un barrio elegido — antes no había
  // forma de saber dónde está el dueño, así que se buscaba siempre desde el
  // Obelisco (fijo), lo que podía dejar afuera a paseadores de zonas reales
  // como Belgrano. Al cambiar de barrio se limpia el paseador ya elegido:
  // puede que no esté disponible en la nueva búsqueda.
  useEffect(() => {
    setSelectedWalkerId("");
    if (!barrio) {
      setWalkers([]);
      return;
    }
    walkersAPI
      .list({ lat: barrio.lat, lng: barrio.lng })
      .then((res) => setWalkers(res.data));
  }, [barrio]);

  // Agenda del paseador seleccionado — se pide bajo demanda porque la lista de
  // /walkers no trae schedules (solo el detalle GET /walkers/:id lo incluye).
  useEffect(() => {
    if (!selectedWalkerId) {
      setSelectedWalkerSchedule(null);
      return;
    }
    setScheduleLoading(true);
    walkersAPI
      .getById(selectedWalkerId)
      .then((res) => setSelectedWalkerSchedule(res.data.schedules ?? []))
      .catch(() => setSelectedWalkerSchedule(null))
      .finally(() => setScheduleLoading(false));
  }, [selectedWalkerId]);

  if (!ready) return null;

  // ── Agregar perro inline ──
  const handleAddDog = async () => {
    if (!dogName.trim()) return;
    setAddingDog(true);
    setDogError(null);
    try {
      const res = await dogsAPI.create({ name: dogName.trim(), size: dogSize });
      const newDog: Dog = res.data;
      setDogs((prev) => [...prev, newDog]);
      setSelectedDogId(newDog.id);
      setDogName("");
    } catch (err) {
      const msg = (err as AxiosError<{ message: string }>)?.response?.data?.message;
      setDogError(msg ?? "No se pudo agregar el perro");
    } finally {
      setAddingDog(false);
    }
  };

  // ── Reservar ──
  const handleSubmit = async () => {
    if (!barrio || !selectedDogId || !selectedTypeId || !selectedWalkerId || !scheduledAt || !pickupAddress) {
      setSubmitError("Completá todos los campos antes de continuar");
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await walksAPI.create({
        walkerId: selectedWalkerId,
        walkTypeId: selectedTypeId,
        dogIds: [selectedDogId],
        scheduledAt: new Date(scheduledAt).toISOString(),
        // PROVISIONAL: centroide del barrio, no la dirección exacta de abajo
        // (ver el comentario de lib/barrios.ts) — hasta que haya geocodificación
        // real con Mapbox.
        pickupLat: barrio.lat,
        pickupLng: barrio.lng,
        pickupAddress,
      });
      router.push(`/walks/${res.data.id}`);
    } catch (err) {
      const data = (err as AxiosError<{ message: string | string[] }>)?.response?.data;
      const msg = Array.isArray(data?.message)
        ? data.message.join(". ")
        : (data?.message ?? "Error al crear el paseo");
      setSubmitError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const selectedType = walkTypes.find((t) => t.id === selectedTypeId);
  const selectedWalker = walkers.find((w) => w.id === selectedWalkerId);

  // Qué falta para poder reservar — la barra fija de abajo lo muestra en vez
  // de dejar el botón apagado sin explicación.
  const missing: string[] = [];
  if (!selectedDogId) missing.push("el perro");
  if (!selectedTypeId) missing.push("el tipo de paseo");
  if (!barrio || !selectedWalkerId) missing.push("un paseador");
  if (!scheduledAt) missing.push("la fecha y hora");
  if (!pickupAddress) missing.push("la dirección");

  return (
    <>
      {/* pb-56 deja lugar para la barra fija de abajo — sin este padding el
          último paso (Paso 4) queda tapado detrás de ella en mobile. */}
      <main className="flex-1 py-6 pb-56">
        <Container width="form" className="flex flex-col gap-6">
          <header className="flex items-center gap-3">
            <h1 className="text-xl font-serif font-bold text-brand-text">Reservar paseo</h1>
          </header>

          {/* ── PASO 1: Perro ── */}
          <section className="flex flex-col gap-4 bg-brand-surface rounded-2xl p-5 shadow-card border border-brand-border">
            <h2 className="font-semibold text-brand-text-body">1. ¿Qué perro va?</h2>

            {dogs.length > 0 && (
              <div className="flex flex-col gap-2">
                {dogs.map((dog) => (
                  <Card
                    key={dog.id}
                    interactive
                    padding="none"
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedDogId(dog.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setSelectedDogId(dog.id);
                      }
                    }}
                    className={cn(
                      "flex items-center justify-between px-4 py-3",
                      selectedDogId === dog.id && "border-brand-primary bg-brand-primary-soft"
                    )}
                  >
                    <span
                      className={cn(
                        "text-sm",
                        selectedDogId === dog.id ? "text-brand-primary font-semibold" : "text-brand-text-body"
                      )}
                    >
                      {dog.name}
                    </span>
                    <span className="text-xs text-brand-text-muted capitalize">{dog.size}</span>
                  </Card>
                ))}
              </div>
            )}

            {dogs.length === 0 && (
              <p className="text-sm text-brand-text-muted">
                Todavía no tenés perros registrados. Agregá uno para continuar.
              </p>
            )}

            <div className="border-t border-brand-border pt-4 flex flex-col gap-3">
              <p className="text-xs font-semibold text-brand-text-muted uppercase tracking-wide">
                {dogs.length === 0 ? "Agregar perro" : "Agregar otro perro"}
              </p>
              <Input
                type="text"
                placeholder="Nombre del perro"
                value={dogName}
                onChange={(e) => setDogName(e.target.value)}
                error={dogError ?? undefined}
              />
              <div className="flex gap-2">
                {(["small", "medium", "large"] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setDogSize(s)}
                    className={`flex-1 h-9 rounded-xl border text-xs font-medium transition-colors ${
                      dogSize === s
                        ? "border-brand-primary bg-brand-primary-soft text-brand-primary"
                        : "border-brand-border text-brand-text-muted hover:bg-brand-bg"
                    }`}
                  >
                    {s === "small" ? "Pequeño" : s === "medium" ? "Mediano" : "Grande"}
                  </button>
                ))}
              </div>
              <Button
                variant="secondary"
                onClick={handleAddDog}
                disabled={!dogName.trim()}
                loading={addingDog}
              >
                Agregar perro
              </Button>
            </div>
          </section>

          {/* ── PASO 2: Tipo de paseo ── */}
          <section className="flex flex-col gap-3 bg-brand-surface rounded-2xl p-5 shadow-card border border-brand-border">
            <h2 className="font-semibold text-brand-text-body">2. Tipo de paseo</h2>
            <div className="grid grid-cols-2 gap-2">
              {walkTypes.map((t) => (
                <Card
                  key={t.id}
                  interactive
                  padding="none"
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedTypeId(t.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setSelectedTypeId(t.id);
                    }
                  }}
                  className={cn(
                    "flex flex-col gap-0.5 p-4 text-left",
                    selectedTypeId === t.id && "border-brand-primary bg-brand-primary-soft"
                  )}
                >
                  <span className={`text-sm font-semibold ${selectedTypeId === t.id ? "text-brand-primary" : "text-brand-text-body"}`}>
                    {t.label}
                  </span>
                  <span className="text-xs text-brand-text-muted">${t.basePrice.toLocaleString("es-AR")}</span>
                </Card>
              ))}
            </div>
          </section>

          {/* ── PASO 3: Paseador ── */}
          <section className="flex flex-col gap-3 bg-brand-surface rounded-2xl p-5 shadow-card border border-brand-border">
            <h2 className="font-semibold text-brand-text-body">3. Elegí un paseador</h2>

            <BarrioSelect
              value={barrio?.nombre ?? ""}
              onChange={setBarrio}
              label="Tu barrio"
            />

            {!barrio && (
              <p className="text-sm text-brand-text-muted">
                Elegí tu barrio para ver los paseadores disponibles cerca tuyo.
              </p>
            )}
            {barrio && walkers.length === 0 && (
              <p className="text-sm text-brand-text-muted">
                No hay paseadores disponibles en {barrio.nombre} todavía.
              </p>
            )}
            <div className="flex flex-col gap-2">
              {walkers.map((w) => (
                <Card
                  key={w.id}
                  interactive
                  padding="none"
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedWalkerId(w.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setSelectedWalkerId(w.id);
                    }
                  }}
                  className={cn(
                    "flex flex-col gap-1 px-4 py-3 text-left",
                    selectedWalkerId === w.id && "border-brand-primary bg-brand-primary-soft"
                  )}
                >
                  <span className={`text-sm font-semibold ${selectedWalkerId === w.id ? "text-brand-primary" : "text-brand-text-body"}`}>
                    {w.user.firstName}
                    {w.rating != null && (
                      <span className="ml-2 text-xs font-normal text-brand-text-muted">
                        ★ {w.rating.toFixed(1)}
                      </span>
                    )}
                  </span>
                  {w.bio && <span className="text-xs text-brand-text-muted line-clamp-2">{w.bio}</span>}
                </Card>
              ))}
            </div>

            {selectedWalker && (
              <p className="text-xs text-brand-text-muted px-1">
                <strong className="text-brand-text-body">Agenda:</strong>{" "}
                {scheduleLoading
                  ? "Cargando…"
                  : summarizeSchedule(selectedWalkerSchedule ?? [])}
              </p>
            )}
          </section>

          {/* ── PASO 4: Fecha y dirección ── */}
          <section className="flex flex-col gap-4 bg-brand-surface rounded-2xl p-5 shadow-card border border-brand-border">
            <h2 className="font-semibold text-brand-text-body">4. Fecha, hora y lugar</h2>
            <div className="flex flex-col gap-3">
              <Input
                type="datetime-local"
                label="Fecha y hora"
                value={scheduledAt}
                min={minScheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
              />
              <Input
                type="text"
                label="Dirección de encuentro"
                placeholder="Ej: Av. Santa Fe 1234, Palermo"
                value={pickupAddress}
                onChange={(e) => setPickupAddress(e.target.value)}
              />
            </div>
          </section>
        </Container>
      </main>

      {/* Barra fija de resumen + CTA. El botón de reservar estaba al final
          de un formulario de 5 pasos: en mobile había que scrollear todo
          para llegar. Fixed (no sticky) porque tiene que estar visible
          desde el paso 1, no solo al llegar al final del documento. */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-brand-border bg-brand-surface shadow-float">
        <Container width="form" className="flex flex-col gap-2 pt-3 pb-safe">
          {(selectedDogId || selectedType || selectedWalker) && (
            <div className="text-sm text-brand-text-body flex flex-col gap-0.5">
              {selectedDogId && (
                <span>Perro: <strong>{dogs.find((d) => d.id === selectedDogId)?.name}</strong></span>
              )}
              {selectedType && (
                <span>Paseo: <strong>{selectedType.label}</strong> — ${selectedType.basePrice.toLocaleString("es-AR")}</span>
              )}
              {selectedWalker && (
                <span>Paseador: <strong>{selectedWalker.user.firstName}</strong></span>
              )}
            </div>
          )}

          {missing.length > 0 && (
            <p className="text-xs text-brand-text-muted">Te falta elegir: {missing.join(", ")}.</p>
          )}

          {submitError && (
            <div className="px-3 py-2 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700">
              {submitError}
            </div>
          )}

          <Button size="lg" fullWidth onClick={handleSubmit} disabled={missing.length > 0} loading={submitting}>
            Reservar
          </Button>
        </Container>
      </div>
    </>
  );
}
