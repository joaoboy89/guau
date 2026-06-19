"use client";

import { useEffect, useRef, useCallback } from "react";
import { io, Socket } from "socket.io-client";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "http://localhost:3001";

interface WalkLocation {
  walkId: string;
  lat: number;
  lng: number;
  recordedAt: string;
}

interface WalkStatusChange {
  walkId: string;
  status: string;
}

interface UseWalkTrackingOptions {
  walkId: string;
  onLocation?: (loc: WalkLocation) => void;
  onStatusChange?: (change: WalkStatusChange) => void;
}

export function useWalkTracking({
  walkId,
  onLocation,
  onStatusChange,
}: UseWalkTrackingOptions) {
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const token = typeof window !== "undefined"
      ? localStorage.getItem("access_token")
      : null;

    if (!token) return;

    const socket = io(WS_URL, {
      auth: { token: `Bearer ${token}` },
      transports: ["websocket", "polling"],
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      // Unirse a la sala del paseo y a la sala personal
      socket.emit("walk:join", { walkId });
      socket.emit("user:join");
    });

    socket.on("walk:location:update", (data: WalkLocation) => {
      onLocation?.(data);
    });

    socket.on("walk:status:changed", (data: WalkStatusChange) => {
      onStatusChange?.(data);
    });

    return () => {
      socket.emit("walk:leave", { walkId });
      socket.disconnect();
    };
  }, [walkId]);

  // Para que el paseador envíe su ubicación
  const sendLocation = useCallback((lat: number, lng: number) => {
    socketRef.current?.emit("walk:location", { walkId, lat, lng });
  }, [walkId]);

  return { sendLocation };
}
