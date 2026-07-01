"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useRequireAuth } from "@/lib/auth";
import { dogsAPI, walkTypesAPI, walkersAPI, walksAPI } from "@/lib/api";
import { Logo } from "@/components/Logo";
import { AxiosError } from "axios";

// TODO: reemplazar por geolocalización real del dueño cuando se integre Mapbox
const DEFAULT_LAT = -34.6037;
const DEFAULT_LNG = -58.3816;

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
  user: { firstName: string; lastName: string };
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

  // ── Walkers ──
  const [walkers, setWalkers] = useState<Walker[]>([]);
  const [selectedWalkerId, setSelectedWalkerId] = useState<string>("");

  // ── Detalles ──
  const [scheduledAt, setScheduledAt] = useState("");
  const [pickupAddress, setPickupAddress] = useState("");

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
    walkersAPI
      .list({ lat: DEFAULT_LAT, lng: DEFAULT_LNG })
      .then((res) => setWalkers(res.data));
  }, [ready]);

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
    if (!selectedDogId || !selectedTypeId || !selectedWalkerId || !scheduledAt || !pickupAddress) {
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
        pickupLat: DEFAULT_LAT, // TODO: reemplazar por geolocalización real del dueño cuando se integre Mapbox
        pickupLng: DEFAULT_LNG,
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

  return (
    <main className="min-h-dvh bg-brand-bg p-6 flex flex-col gap-6 max-w-lg mx-auto">
      <header className="flex items-center gap-3">
        <Logo size={32} />
        <h1 className="text-xl font-serif font-bold text-brand-text">Reservar paseo</h1>
      </header>

      {/* ── PASO 1: Perro ── */}
      <section className="flex flex-col gap-4 bg-brand-surface rounded-2xl p-5 shadow-card border border-brand-border">
        <h2 className="font-semibold text-brand-text-body">1. ¿Qué perro va?</h2>

        {dogs.length > 0 && (
          <div className="flex flex-col gap-2">
            {dogs.map((dog) => (
              <button
                key={dog.id}
                onClick={() => setSelectedDogId(dog.id)}
                className={`flex items-center justify-between px-4 py-3 rounded-xl border text-sm transition-colors ${
                  selectedDogId === dog.id
                    ? "border-brand-primary bg-brand-primary-soft text-brand-primary font-semibold"
                    : "border-brand-border text-brand-text-body hover:bg-brand-bg"
                }`}
              >
                <span>{dog.name}</span>
                <span className="text-xs text-brand-text-muted capitalize">{dog.size}</span>
              </button>
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
          <input
            type="text"
            placeholder="Nombre del perro"
            value={dogName}
            onChange={(e) => setDogName(e.target.value)}
            className="h-11 px-4 rounded-xl border border-brand-border bg-brand-bg text-sm text-brand-text placeholder:text-brand-text-muted focus:outline-none focus:border-brand-primary"
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
          {dogError && <p className="text-xs text-red-600">{dogError}</p>}
          <button
            onClick={handleAddDog}
            disabled={addingDog || !dogName.trim()}
            className="h-10 rounded-xl bg-brand-primary text-white text-sm font-semibold disabled:opacity-40 transition-opacity hover:opacity-90"
          >
            {addingDog ? "Guardando…" : "Agregar perro"}
          </button>
        </div>
      </section>

      {/* ── PASO 2: Tipo de paseo ── */}
      <section className="flex flex-col gap-3 bg-brand-surface rounded-2xl p-5 shadow-card border border-brand-border">
        <h2 className="font-semibold text-brand-text-body">2. Tipo de paseo</h2>
        <div className="grid grid-cols-2 gap-2">
          {walkTypes.map((t) => (
            <button
              key={t.id}
              onClick={() => setSelectedTypeId(t.id)}
              className={`flex flex-col gap-0.5 p-4 rounded-xl border text-left transition-colors ${
                selectedTypeId === t.id
                  ? "border-brand-primary bg-brand-primary-soft"
                  : "border-brand-border hover:bg-brand-bg"
              }`}
            >
              <span className={`text-sm font-semibold ${selectedTypeId === t.id ? "text-brand-primary" : "text-brand-text-body"}`}>
                {t.label}
              </span>
              <span className="text-xs text-brand-text-muted">${t.basePrice.toLocaleString("es-AR")}</span>
            </button>
          ))}
        </div>
      </section>

      {/* ── PASO 3: Paseador ── */}
      <section className="flex flex-col gap-3 bg-brand-surface rounded-2xl p-5 shadow-card border border-brand-border">
        <h2 className="font-semibold text-brand-text-body">3. Elegí un paseador</h2>
        {walkers.length === 0 && (
          <p className="text-sm text-brand-text-muted">No hay paseadores disponibles en tu zona.</p>
        )}
        <div className="flex flex-col gap-2">
          {walkers.map((w) => (
            <button
              key={w.id}
              onClick={() => setSelectedWalkerId(w.id)}
              className={`flex flex-col gap-1 px-4 py-3 rounded-xl border text-left transition-colors ${
                selectedWalkerId === w.id
                  ? "border-brand-primary bg-brand-primary-soft"
                  : "border-brand-border hover:bg-brand-bg"
              }`}
            >
              <span className={`text-sm font-semibold ${selectedWalkerId === w.id ? "text-brand-primary" : "text-brand-text-body"}`}>
                {w.user.firstName} {w.user.lastName}
                {w.rating != null && (
                  <span className="ml-2 text-xs font-normal text-brand-text-muted">
                    ★ {w.rating.toFixed(1)}
                  </span>
                )}
              </span>
              {w.bio && <span className="text-xs text-brand-text-muted line-clamp-2">{w.bio}</span>}
            </button>
          ))}
        </div>
      </section>

      {/* ── PASO 4: Fecha y dirección ── */}
      <section className="flex flex-col gap-4 bg-brand-surface rounded-2xl p-5 shadow-card border border-brand-border">
        <h2 className="font-semibold text-brand-text-body">4. Fecha, hora y lugar</h2>
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-brand-text-muted">Fecha y hora</span>
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              className="h-11 px-4 rounded-xl border border-brand-border bg-brand-bg text-sm text-brand-text focus:outline-none focus:border-brand-primary"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-brand-text-muted">Dirección de encuentro</span>
            <input
              type="text"
              placeholder="Ej: Av. Santa Fe 1234, Palermo"
              value={pickupAddress}
              onChange={(e) => setPickupAddress(e.target.value)}
              className="h-11 px-4 rounded-xl border border-brand-border bg-brand-bg text-sm text-brand-text placeholder:text-brand-text-muted focus:outline-none focus:border-brand-primary"
            />
          </label>
        </div>
      </section>

      {/* ── Resumen + CTA ── */}
      {(selectedDogId || selectedType || selectedWalker) && (
        <div className="px-4 py-3 rounded-2xl bg-brand-primary-soft border border-brand-primary/20 text-sm text-brand-text-body flex flex-col gap-1">
          {selectedDogId && (
            <span>Perro: <strong>{dogs.find((d) => d.id === selectedDogId)?.name}</strong></span>
          )}
          {selectedType && (
            <span>Paseo: <strong>{selectedType.label}</strong> — ${selectedType.basePrice.toLocaleString("es-AR")}</span>
          )}
          {selectedWalker && (
            <span>Paseador: <strong>{selectedWalker.user.firstName} {selectedWalker.user.lastName}</strong></span>
          )}
        </div>
      )}

      {submitError && (
        <div className="px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">
          {submitError}
        </div>
      )}

      <button
        onClick={handleSubmit}
        disabled={submitting || !selectedDogId || !selectedTypeId || !selectedWalkerId || !scheduledAt || !pickupAddress}
        className="h-13 rounded-2xl bg-brand-primary text-white font-semibold text-base disabled:opacity-40 transition-opacity hover:opacity-90 shadow-float"
      >
        {submitting ? "Reservando…" : "Reservar"}
      </button>
    </main>
  );
}
