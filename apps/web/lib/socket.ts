/**
 * Socket.io client para tracking GPS en tiempo real durante el paseo.
 * Singleton: una sola conexión compartida por toda la app.
 */

import { io, Socket } from "socket.io-client";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    const token =
      typeof window !== "undefined" ? localStorage.getItem("access_token") : null;

    socket = io(API_URL, {
      autoConnect: false,
      transports: ["websocket"],
      auth: token ? { token } : undefined,
    });
  }
  return socket;
}

export function connectSocket(): Socket {
  const s = getSocket();
  if (!s.connected) s.connect();
  return s;
}

export function disconnectSocket() {
  if (socket?.connected) {
    socket.disconnect();
  }
}

// ─── Tipos de eventos ─────────────────────────────────────────────────────────

export interface LocationPayload {
  walkId:    string;
  lat:       number;
  lng:       number;
  timestamp: number;
}

export function joinWalk(walkId: string) {
  getSocket().emit("walk:join", { walkId });
}

export function leaveWalk(walkId: string) {
  getSocket().emit("walk:leave", { walkId });
}

export function sendLocation(payload: LocationPayload) {
  getSocket().emit("walk:location", payload);
}

export function joinUser(userId: string) {
  getSocket().emit("user:join", { userId });
}
