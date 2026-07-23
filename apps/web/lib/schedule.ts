export const DAY_LABELS = [
  "Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado",
] as const;

export const DAY_LABELS_SHORT = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"] as const;

interface ScheduleSlot {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
}

// Agrupa días consecutivos (0=Dom ... 6=Sáb) con el mismo horario en un texto
// compacto, ej. "Lun a Vie 09:00-18:00 · Sáb 10:00-14:00". No maneja el
// wraparound Sáb->Dom a propósito — alcanza para los patrones reales (bloque
// de semana + fin de semana aparte).
export function summarizeSchedule(schedules: ScheduleSlot[]): string {
  if (schedules.length === 0) return "Sin horarios cargados";

  const sorted = [...schedules].sort((a, b) => a.dayOfWeek - b.dayOfWeek);

  const groups: Array<{ start: number; end: number; startTime: string; endTime: string }> = [];
  for (const s of sorted) {
    const last = groups[groups.length - 1];
    const continuesRun =
      last && last.end === s.dayOfWeek - 1 && last.startTime === s.startTime && last.endTime === s.endTime;

    if (continuesRun) {
      last.end = s.dayOfWeek;
    } else {
      groups.push({ start: s.dayOfWeek, end: s.dayOfWeek, startTime: s.startTime, endTime: s.endTime });
    }
  }

  return groups
    .map((g) => {
      const dayLabel =
        g.start === g.end
          ? DAY_LABELS_SHORT[g.start]
          : `${DAY_LABELS_SHORT[g.start]} a ${DAY_LABELS_SHORT[g.end]}`;
      return `${dayLabel} ${g.startTime}-${g.endTime}`;
    })
    .join(" · ");
}
