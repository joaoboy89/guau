import { notificationHref } from "./notification-href";

describe("notificationHref", () => {
  it("dueño con walkId en data: va al detalle del paseo", () => {
    expect(notificationHref("owner", { walkId: "walk-1" })).toBe("/walks/walk-1");
  });

  it("paseador: siempre va al dashboard, tenga o no walkId en data", () => {
    expect(notificationHref("walker", { walkId: "walk-1" })).toBe("/walker/dashboard");
    expect(notificationHref("walker", {})).toBe("/walker/dashboard");
    expect(notificationHref("walker", null)).toBe("/walker/dashboard");
  });

  it("dueño sin walkId en data: sin link", () => {
    expect(notificationHref("owner", {})).toBeNull();
  });

  it("dueño con data vacia (null/undefined): sin link", () => {
    expect(notificationHref("owner", null)).toBeNull();
    expect(notificationHref("owner", undefined)).toBeNull();
  });

  it("dueño con walkId que no es string: sin link — nunca /walks/[object Object] ni /walks/123", () => {
    expect(notificationHref("owner", { walkId: 123 })).toBeNull();
    expect(notificationHref("owner", { walkId: { id: "walk-1" } })).toBeNull();
    expect(notificationHref("owner", { walkId: null })).toBeNull();
  });

  it("dueño con walkId vacio: sin link — nunca /walks/ sin id", () => {
    expect(notificationHref("owner", { walkId: "" })).toBeNull();
  });

  it("dueño con data que no es un objeto (string, array, numero): sin link", () => {
    expect(notificationHref("owner", "walk-1")).toBeNull();
    expect(notificationHref("owner", ["walk-1"])).toBeNull();
    expect(notificationHref("owner", 1)).toBeNull();
  });

  it("admin: sin regla propia todavia, sin link — no se inventa un destino", () => {
    expect(notificationHref("admin", { walkId: "walk-1" })).toBeNull();
  });
});
