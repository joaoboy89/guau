import { ChevronRight } from "lucide-react";
import { Badge, Button } from "@/components/ui";
import { formatDateShortBA } from "@/lib/format-date";
import { STATUS_BADGE } from "@/lib/admin/walker-status";
import type { AdminWalkersResponse } from "@/lib/admin/api";
import { cn } from "@/lib/cn";

// Una fila por paseador: nombre, mail, fecha de alta y estado — lo justo
// para elegir a quién abrir (mismo criterio que support/ResultsList).
export function WalkersTable({
  result,
  selectedId,
  onSelect,
  onPageChange,
}: {
  result: AdminWalkersResponse;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onPageChange: (page: number) => void;
}) {
  const { data, meta } = result;

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto rounded-2xl border border-brand-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-brand-surface-sand text-left text-xs text-brand-text-muted uppercase tracking-wide">
              <th className="px-4 py-2 font-semibold">Nombre</th>
              <th className="px-4 py-2 font-semibold">Mail</th>
              <th className="px-4 py-2 font-semibold">Alta</th>
              <th className="px-4 py-2 font-semibold">Estado</th>
              <th className="px-4 py-2 w-8" aria-hidden="true" />
            </tr>
          </thead>
          <tbody>
            {data.map((walker) => {
              const badge = STATUS_BADGE[walker.verificationStatus];
              return (
                <tr
                  key={walker.id}
                  onClick={() => onSelect(walker.id)}
                  className={cn(
                    "border-t border-brand-border cursor-pointer transition-colors hover:bg-brand-surface-sand",
                    selectedId === walker.id && "bg-brand-primary-soft",
                  )}
                >
                  <td className="px-4 py-2 font-medium text-brand-text">
                    {walker.user.firstName} {walker.user.lastName}
                  </td>
                  <td className="px-4 py-2 text-brand-text-body">{walker.user.email}</td>
                  <td className="px-4 py-2 text-brand-text-body">
                    {formatDateShortBA(new Date(walker.user.createdAt))}
                  </td>
                  <td className="px-4 py-2">
                    <Badge variant={badge.variant}>{badge.label}</Badge>
                  </td>
                  <td className="px-4 py-2 text-brand-text-muted">
                    <ChevronRight size={16} aria-hidden="true" />
                  </td>
                </tr>
              );
            })}
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
