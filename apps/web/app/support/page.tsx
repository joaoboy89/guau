"use client";

import { useState } from "react";
import { AxiosError } from "axios";
import { useRequireAuth, useLogout } from "@/lib/auth";
import { Container, Spinner } from "@/components/ui";
import { Logo } from "@/components/Logo";
import { SearchForm } from "@/components/support/SearchForm";
import { ResultsList } from "@/components/support/ResultsList";
import { buildSearchQuery, type SupportSearchFields } from "@/lib/support/search-params";
import { supportAPI, type SupportSearchQuery, type SupportSearchResponse } from "@/lib/support/api";

// Escritorio primero, deliberado (docs/diseños/modulo-soporte.md §7bis):
// soporte es un trabajo de escritorio, alguien con el chat de la persona en
// una ventana y el panel en la otra. Usable en móvil, no optimizada.
//
// El panel abre SIN datos — nunca un listado de todos los paseos al entrar
// (§4: deny-by-default aplicado a una pantalla). Ese vacío inicial no es un
// bug de esta pantalla, es el diseño.
export default function SupportSearchPage() {
  const { user, ready } = useRequireAuth("admin");
  const logout = useLogout();

  const [lastQuery, setLastQuery] = useState<SupportSearchQuery | null>(null);
  const [result, setResult] = useState<SupportSearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invalidAttempt, setInvalidAttempt] = useState(false);

  const runSearch = async (query: SupportSearchQuery) => {
    setLoading(true);
    setError(null);
    try {
      const res = await supportAPI.searchWalks(query);
      setResult(res.data);
      setLastQuery(query);
    } catch (err) {
      const msg = (err as AxiosError<{ message: string }>)?.response?.data?.message;
      setError(msg ?? "No se pudo hacer la búsqueda. Probá de nuevo en un momento.");
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (fields: SupportSearchFields) => {
    const query = buildSearchQuery(fields);
    // Deny-by-default tambien en el front (defensa en las dos capas, a
    // proposito — el backend hace exactamente el mismo corte): con los
    // cuatro campos vacios, ni se llama a la API.
    if (query === null) {
      setInvalidAttempt(true);
      setResult(null);
      return;
    }
    setInvalidAttempt(false);
    void runSearch({ ...query, page: 1 });
  };

  const handlePageChange = (page: number) => {
    if (!lastQuery) return;
    void runSearch({ ...lastQuery, page });
  };

  if (!ready) return null;

  return (
    <main className="min-h-dvh bg-brand-bg">
      <Container width="wide" className="flex flex-col gap-6 py-6">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Logo size={36} />
            <div>
              <h1 className="text-xl font-serif font-bold text-brand-text">Soporte</h1>
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

        <SearchForm onSearch={handleSearch} invalidAttempt={invalidAttempt} />

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
              No encontramos ningún paseo con esos datos.
            </p>
            <p className="text-sm text-brand-text-muted max-w-md">
              Si te dio el código, pedile también el mail — o probá con el de la otra parte.
            </p>
          </div>
        )}

        {!loading && !error && result && result.data.length > 0 && (
          <ResultsList result={result} onPageChange={handlePageChange} />
        )}
      </Container>
    </main>
  );
}
