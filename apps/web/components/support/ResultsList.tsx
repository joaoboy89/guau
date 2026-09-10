import Link from "next/link";
import { Badge, Button } from "@/components/ui";
import { STATUS_LABEL, STATUS_VARIANT } from "@/lib/walk-status";
import { formatDateTimeBA } from "@/lib/format-date";
import { shortWalkId } from "@/lib/walk-id";
import type { SupportSearchResponse } from "@/lib/support/api";

// Una lista para RECONOCER, no para leer (docs/diseños/modulo-soporte.md
// §7bis): lo justo para decir "es este". Click y entra al caso.
export function ResultsList({
  result,
  onPageChange,
}: {
  result: SupportSearchResponse;
  onPageChange: (page: number) => void;
}) {
  const { data, meta } = result;

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto rounded-2xl border border-brand-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-brand-surface-sand text-left text-xs text-brand-text-muted uppercase tracking-wide">
              <th className="px-4 py-2 font-semibold">Código</th>
              <th className="px-4 py-2 font-semibold">Fecha y hora</th>
              <th className="px-4 py-2 font-semibold">Estado</th>
              <th className="px-4 py-2 font-semibold">Perro</th>
              <th className="px-4 py-2 font-semibold">Dueño → Paseador</th>
            </tr>
          </thead>
          <tbody>
            {data.map((walk) => (
              <tr key={walk.id} className="border-t border-brand-border">
                <td className="px-4 py-2">
                  <Link
                    href={`/support/walks/${walk.id}`}
                    className="font-mono text-brand-primary font-semibold hover:underline"
                  >
                    {shortWalkId(walk.id)}
                  </Link>
                </td>
                <td className="px-4 py-2 text-brand-text-body">
                  {formatDateTimeBA(new Date(walk.scheduledAt))}
                </td>
                <td className="px-4 py-2">
                  <Badge variant={STATUS_VARIANT[walk.status] ?? "default"}>
                    {STATUS_LABEL[walk.status] ?? walk.status}
                  </Badge>
                </td>
                <td className="px-4 py-2 text-brand-text-body">
                  {walk.dogs.length > 0 ? walk.dogs.map((d) => d.name).join(", ") : "—"}
                </td>
                <td className="px-4 py-2 text-brand-text-body">
                  {walk.owner ? walk.owner.firstName : "—"} → {walk.walker.firstName}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {meta.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <Button
            variant="secondary"
            size="sm"
            disabled={meta.page <= 1}
            onClick={() => onPageChange(meta.page - 1)}
          >
            ← Anterior
          </Button>
          <span className="text-xs text-brand-text-muted">
            Página {meta.page} de {meta.totalPages} — {meta.total} resultado{meta.total === 1 ? "" : "s"}
          </span>
          <Button
            variant="secondary"
            size="sm"
            disabled={meta.page >= meta.totalPages}
            onClick={() => onPageChange(meta.page + 1)}
          >
            Siguiente →
          </Button>
        </div>
      )}
    </div>
  );
}
