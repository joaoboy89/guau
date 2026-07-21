/**
 * Zustand store global.
 * Slices: auth, walks, notifications.
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type UserRole = "owner" | "walker" | "admin";

export interface AuthUser {
  id:        string;
  email:     string;
  name:      string;
  role:      UserRole;
  avatarUrl?: string;
}

export interface Dog {
  id:       string;
  name:     string;
  breed:    string;
  size:     "small" | "medium" | "large";
  photoUrl?: string;
  notes?:   string;
}

export interface Walk {
  id:              string;
  status:          "pending" | "confirmed" | "in_progress" | "completed" | "cancelled" | "rejected";
  scheduledAt:     string;
  durationMinutes: number;
  walkerName?:     string;
  walkerAvatar?:   string;
  ownerName?:      string;
}

export interface Notification {
  id:        string;
  title:     string;
  body:      string;
  type:      string;
  isRead:    boolean;
  createdAt: string;
}

// ─── Auth slice ───────────────────────────────────────────────────────────────

interface AuthSlice {
  user:       AuthUser | null;
  isLoggedIn: boolean;
  setUser:    (user: AuthUser | null) => void;
  logout:     () => void;
}

// ─── Walks slice ──────────────────────────────────────────────────────────────

interface WalksSlice {
  activeWalk:    Walk | null;
  walks:         Walk[];
  setActiveWalk: (walk: Walk | null) => void;
  setWalks:      (walks: Walk[]) => void;
}

// ─── Notifications slice ──────────────────────────────────────────────────────

interface NotificationsSlice {
  notifications:        Notification[];
  unreadCount:          number;
  setNotifications:     (n: Notification[]) => void;
  addNotification:      (n: Notification) => void;
  markNotificationRead: (id: string) => void;
}

// ─── Combined store ───────────────────────────────────────────────────────────

type AppStore = AuthSlice & WalksSlice & NotificationsSlice;

export const useStore = create<AppStore>()(
  persist(
    (set) => ({
      // ── Auth ──
      user:       null,
      isLoggedIn: false,

      setUser: (user) => set({ user, isLoggedIn: !!user }),

      logout: () => {
        set({ user: null, isLoggedIn: false, activeWalk: null, walks: [] });
      },

      // ── Walks ──
      activeWalk: null,
      walks:      [],

      setActiveWalk: (walk) => set({ activeWalk: walk }),
      setWalks:      (walks) => set({ walks }),

      // ── Notifications ──
      notifications: [],
      unreadCount:   0,

      setNotifications: (notifications) =>
        set({
          notifications,
          unreadCount: notifications.filter((n) => !n.isRead).length,
        }),

      addNotification: (notification) =>
        set((state) => {
          if (state.notifications.some((n) => n.id === notification.id)) return state;
          return {
            notifications: [notification, ...state.notifications],
            unreadCount:   state.unreadCount + (notification.isRead ? 0 : 1),
          };
        }),

      markNotificationRead: (id) =>
        set((state) => {
          let wasUnread = false;
          const notifications = state.notifications.map((n) => {
            if (n.id === id && !n.isRead) {
              wasUnread = true;
              return { ...n, isRead: true };
            }
            return n;
          });
          return {
            notifications,
            unreadCount: wasUnread ? Math.max(0, state.unreadCount - 1) : state.unreadCount,
          };
        }),
    }),
    {
      name:    "guau-store",
      storage: createJSONStorage(() =>
        typeof window !== "undefined" ? localStorage : ({} as Storage)
      ),
      // Solo persistir auth
      partialize: (state) => ({
        user:       state.user,
        isLoggedIn: state.isLoggedIn,
      }),
    }
  )
);

// ─── Selectores ───────────────────────────────────────────────────────────────
export const useAuth   = () => useStore((s) => ({ user: s.user, isLoggedIn: s.isLoggedIn, setUser: s.setUser, logout: s.logout }));
export const useWalks  = () => useStore((s) => ({ activeWalk: s.activeWalk, walks: s.walks, setActiveWalk: s.setActiveWalk, setWalks: s.setWalks }));
export const useNotifs = () => useStore((s) => ({
  notifications:        s.notifications,
  unreadCount:          s.unreadCount,
  setNotifications:     s.setNotifications,
  addNotification:      s.addNotification,
  markNotificationRead: s.markNotificationRead,
}));
