"use client";

import { useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { SOCKET_EVENTS } from "@guau/shared";
import { notificationsAPI } from "@/lib/api";
import { useAuth, useNotifs, type Notification } from "@/lib/store";
import { connectSocket, joinUser } from "@/lib/socket";

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.floor(diffMs / 60_000);

  if (diffMin < 1) return "ahora";
  if (diffMin < 60) return `hace ${diffMin} min`;

  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `hace ${diffH} h`;

  const diffD = Math.floor(diffH / 24);
  return `hace ${diffD} d`;
}

export function NotificationsBell() {
  const { user } = useAuth();
  const { notifications, unreadCount, setNotifications, addNotification, markNotificationRead } =
    useNotifs();

  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Carga inicial
  useEffect(() => {
    if (!user) return;
    notificationsAPI
      .list()
      .then((res) => setNotifications(res.data))
      .catch(() => {});
  }, [user, setNotifications]);

  // Tiempo real: mismo socket compartido que usa tracking
  useEffect(() => {
    if (!user) return;

    const socket = connectSocket();
    joinUser(user.id);

    const handleNew = (notification: Notification) => addNotification(notification);
    socket.on(SOCKET_EVENTS.NOTIFICATION_NEW, handleNew);

    return () => {
      socket.off(SOCKET_EVENTS.NOTIFICATION_NEW, handleNew);
    };
  }, [user, addNotification]);

  // Cerrar al hacer click afuera
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = (notification: Notification) => {
    if (notification.isRead) return;
    markNotificationRead(notification.id);
    notificationsAPI.markRead(notification.id).catch(() => {});
  };

  if (!user) return null;

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Notificaciones"
        aria-expanded={open}
        className="relative w-10 h-10 flex items-center justify-center rounded-xl border border-brand-border bg-brand-surface transition-opacity hover:opacity-80"
      >
        <Bell size={18} className="text-brand-text-body" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-brand-primary text-white text-[10px] font-semibold leading-none">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        // El panel es hijo de un wrapper "relative" anclado a la derecha,
        // adentro del header (px-6, gap-2, botón "Salir"): en 375px el borde
        // derecho del ancla queda a ~98px del borde de pantalla, y un
        // dropdown de w-80 (320px) right-anchored se sale por la izquierda
        // sin importar su ancho — max-w-[90vw] nunca se activaba (90vw de
        // 375px = 337px, más ancho que los 320px que debía limitar).
        // El fix no es un ancho: en mobile deja de ser un dropdown y pasa a
        // ser una hoja inferior anclada a las dos aristas del viewport
        // (inset-x-0) — imposible que se corte, no hay número mágico que
        // pueda desalinearse. Dropdown normal recién desde sm.
        <div className="fixed inset-x-0 bottom-0 top-auto max-h-[70dvh] overflow-y-auto rounded-t-2xl border-t border-brand-border bg-brand-surface shadow-float z-50 sm:absolute sm:inset-x-auto sm:right-0 sm:bottom-auto sm:top-full sm:mt-2 sm:w-80 sm:max-h-96 sm:rounded-2xl sm:border">
          <div className="px-4 py-3 border-b border-brand-border">
            <p className="text-sm font-semibold text-brand-text-body">Notificaciones</p>
          </div>

          {notifications.length === 0 ? (
            <p className="px-4 py-6 text-sm text-center text-brand-text-muted">
              No tenés notificaciones todavía.
            </p>
          ) : (
            <ul>
              {notifications.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => handleSelect(n)}
                    className={`w-full text-left px-4 py-3 border-b border-brand-border last:border-b-0 transition-opacity hover:opacity-80 ${
                      n.isRead ? "" : "bg-brand-primary-soft"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-sm font-semibold text-brand-text-body">{n.title}</span>
                      {!n.isRead && (
                        <span className="mt-1 w-2 h-2 rounded-full bg-brand-primary shrink-0" />
                      )}
                    </div>
                    <p className="text-xs text-brand-text-muted mt-0.5">{n.body}</p>
                    <p className="text-[11px] text-brand-text-muted mt-1">{timeAgo(n.createdAt)}</p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
