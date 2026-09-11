"use client";

import { useCallback, useEffect, useState } from "react";
import { AxiosError } from "axios";
import { useRequireAuth, useLogout } from "@/lib/auth";
import { Container, Spinner } from "@/components/ui";
import { Logo } from "@/components/Logo";
import { WalkersTable } from "@/components/admin/WalkersTable";
import { WalkerDetail } from "@/components/admin/WalkerDetail";
import { adminWalkersAPI, type AdminWalkersResponse } from "@/lib/admin/api";
import { STATUS_TABS, type VerificationStatus } from "@/lib/admin/walker-status";
import { cn } from "@/lib/cn";

// Rebanada 1 de docs/diseños/verificacion-de-paseadores.md: lista por
// estado, ver el perfil, aprobar/rechazar/suspender/reactivar con notas.
// Escritorio-first como support/ (§7bis del módulo de soporte) — mismo tipo
// de trabajo, alguien operando la plataforma, no un usuario final.
export default function AdminWalkersPage() {
  const { user, ready } = useRequireAuth("admin");
  const logout = useLogout();

  const [tab, setTab] = useState<VerificationStatus>("PENDING");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<AdminWalkersResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(async (status: VerificationStatus, p: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminWalkersAPI.getWalkers({ status, page: p, limit: 20 });
      setResult(res.data);
    } catch (err) {
      const msg = (err as AxiosError<{ message: string }>)?.response?.data?.message;
      setError(msg ?? "No se pudo cargar la lista de paseadores. Probá de nuevo en un momento.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!ready) return;
    void load(tab, page);
  }, [ready, tab, page, load]);

  const handleTabChange = (status: VerificationStatus) => {
    setTab(status);
    setPage(1);
    setSelectedId(null);
  };

  const handleActionDone = () => {
    setSelectedId(null);
    void load(tab, page);
  };

  const selected = result?.data.find((w) => w.id === selectedId) ?? null;

  if (!ready) return null;

  return (
    <main className="min-h-dvh bg-brand-bg">
      <Container width="wide" className="flex flex-col gap-6 py-6">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Logo size={36} />
            <div>
              <h1 className="text-xl font-serif font-bold text-brand-text">Verificar paseadores</h1>
              <p className="text-xs text-brand-text-muted">{user?.email}</p>
            </div>
          </div>
          <button
            onClick={logout}
            className="text-sm px-4 py-2 rounded-xl border border-brand-border text-brand-text-muted transition-opacity hover:opacity-70"
          >
            Salir
          </button>
        </header>

        <div className="flex gap-1 border-b border-brand-border">
          {STATUS_TABS.map((t) => (
            <button
              key={t.status}
              onClick={() => handleTabChange(t.status)}
              className={cn(
                "px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors",
                tab === t.status
                  ? "border-brand-primary text-brand-primary"
                  : "border-transparent text-brand-text-muted hover:text-brand-text",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {loading && (
          <div className="flex justify-center py-10 text-brand-primary">
            <Spinner size={28} />
          </div>
        )}

        {error && (
          <div className="px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">
            {error}
          </div>
        )}

        {!loading && !error && result && result.data.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-10 text-center rounded-3xl border border-dashed border-brand-border">
            <p className="text-sm text-brand-text-body font-medium">
              No hay paseadores en este estado.
            </p>
          </div>
        )}

        {!loading && !error && result && result.data.length > 0 && (
          <WalkersTable
            result={result}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onPageChange={setPage}
          />
        )}

        {selected && (
          <WalkerDetail walker={selected} onClose={() => setSelectedId(null)} onDone={handleActionDone} />
        )}
      </Container>
    </main>
  );
}
