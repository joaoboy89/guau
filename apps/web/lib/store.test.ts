/**
 * Tests para el slice de notificaciones del store (lib/store.ts).
 * Cubre la lógica de unreadCount y deduplicación que usa NotificationsBell.
 */

import { useStore, type Notification } from "./store";

function makeNotification(overrides: Partial<Notification> = {}): Notification {
  return {
    id:        "n-1",
    title:     "Título",
    body:      "Cuerpo",
    type:      "walk_confirmed",
    isRead:    false,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

beforeEach(() => {
  useStore.setState({ notifications: [], unreadCount: 0 });
});

describe("store — notifications slice", () => {
  describe("setNotifications", () => {
    it("calcula unreadCount a partir de isRead", () => {
      useStore.getState().setNotifications([
        makeNotification({ id: "1", isRead: false }),
        makeNotification({ id: "2", isRead: true }),
        makeNotification({ id: "3", isRead: false }),
      ]);

      expect(useStore.getState().notifications).toHaveLength(3);
      expect(useStore.getState().unreadCount).toBe(2);
    });
  });

  describe("addNotification", () => {
    it("agrega la notificación al principio de la lista", () => {
      useStore.getState().setNotifications([makeNotification({ id: "old" })]);
      useStore.getState().addNotification(makeNotification({ id: "new" }));

      const { notifications } = useStore.getState();
      expect(notifications.map((n) => n.id)).toEqual(["new", "old"]);
    });

    it("incrementa unreadCount si la notificación nueva no está leída", () => {
      useStore.getState().addNotification(makeNotification({ id: "1", isRead: false }));
      expect(useStore.getState().unreadCount).toBe(1);
    });

    it("no incrementa unreadCount si la notificación nueva ya está leída", () => {
      useStore.getState().addNotification(makeNotification({ id: "1", isRead: true }));
      expect(useStore.getState().unreadCount).toBe(0);
    });

    it("ignora duplicados (mismo id ya presente)", () => {
      useStore.getState().setNotifications([makeNotification({ id: "1", isRead: false })]);
      useStore.getState().addNotification(makeNotification({ id: "1", isRead: false }));

      expect(useStore.getState().notifications).toHaveLength(1);
      expect(useStore.getState().unreadCount).toBe(1);
    });
  });

  describe("markNotificationRead", () => {
    it("marca la notificación como leída y decrementa unreadCount", () => {
      useStore.getState().setNotifications([
        makeNotification({ id: "1", isRead: false }),
        makeNotification({ id: "2", isRead: false }),
      ]);

      useStore.getState().markNotificationRead("1");

      const { notifications, unreadCount } = useStore.getState();
      expect(notifications.find((n) => n.id === "1")?.isRead).toBe(true);
      expect(unreadCount).toBe(1);
    });

    it("es un no-op si la notificación ya estaba leída", () => {
      useStore.getState().setNotifications([makeNotification({ id: "1", isRead: true })]);

      useStore.getState().markNotificationRead("1");

      expect(useStore.getState().unreadCount).toBe(0);
    });

    it("es un no-op si el id no existe", () => {
      useStore.getState().setNotifications([makeNotification({ id: "1", isRead: false })]);

      useStore.getState().markNotificationRead("inexistente");

      expect(useStore.getState().unreadCount).toBe(1);
    });
  });
});
