import { summarizeSchedule } from "./schedule";

describe("summarizeSchedule", () => {
  it("devuelve un mensaje cuando no hay horarios", () => {
    expect(summarizeSchedule([])).toBe("Sin horarios cargados");
  });

  it("agrupa días consecutivos con el mismo horario", () => {
    const schedules = [1, 2, 3, 4, 5].map((dayOfWeek) => ({
      dayOfWeek, startTime: "09:00", endTime: "18:00",
    }));
    expect(summarizeSchedule(schedules)).toBe("Lun a Vie 09:00-18:00");
  });

  it("separa en grupos distintos cuando el horario cambia (ej. semana + sábado)", () => {
    const schedules = [
      ...[1, 2, 3, 4, 5].map((dayOfWeek) => ({ dayOfWeek, startTime: "09:00", endTime: "18:00" })),
      { dayOfWeek: 6, startTime: "10:00", endTime: "14:00" },
    ];
    expect(summarizeSchedule(schedules)).toBe("Lun a Vie 09:00-18:00 · Sáb 10:00-14:00");
  });

  it("un solo día no consecutivo se muestra individualmente", () => {
    const schedules = [{ dayOfWeek: 3, startTime: "08:00", endTime: "12:00" }];
    expect(summarizeSchedule(schedules)).toBe("Mié 08:00-12:00");
  });

  it("no agrupa días consecutivos si el horario es distinto", () => {
    const schedules = [
      { dayOfWeek: 1, startTime: "09:00", endTime: "13:00" },
      { dayOfWeek: 2, startTime: "14:00", endTime: "18:00" },
    ];
    expect(summarizeSchedule(schedules)).toBe("Lun 09:00-13:00 · Mar 14:00-18:00");
  });

  it("ordena los días de entrada aunque lleguen desordenados", () => {
    const schedules = [
      { dayOfWeek: 5, startTime: "09:00", endTime: "18:00" },
      { dayOfWeek: 1, startTime: "09:00", endTime: "18:00" },
      { dayOfWeek: 3, startTime: "09:00", endTime: "18:00" },
      { dayOfWeek: 2, startTime: "09:00", endTime: "18:00" },
      { dayOfWeek: 4, startTime: "09:00", endTime: "18:00" },
    ];
    expect(summarizeSchedule(schedules)).toBe("Lun a Vie 09:00-18:00");
  });
});
