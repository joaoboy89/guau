"use client";

import { Button } from "@/components/ui";

interface AuthErrorStateProps {
  message: string;
}

/**
 * Se muestra cuando useRequireAuth() no pudo confirmar la sesion por un
 * motivo que NO es "no estas logueado" (429 del throttler, 500, caida de
 * red). Sin esto, esas nueve pantallas se quedaban con `if (!ready) return
 * <Spinner />` para siempre — ready nunca llega a true si no hay sesion
 * confirmada, y ya no se redirige a /login para cualquier motivo (ver
 * classifyAuthMeError en lib/auth.ts). Antes al menos te pateaba a algun
 * lado; ahora sin esto seria un spinner eterno y mudo.
 */
export function AuthErrorState({ message }: AuthErrorStateProps) {
  return (
    <div className="flex-1 min-h-[50vh] flex flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="text-sm text-brand-text-body max-w-sm">{message}</p>
      <Button onClick={() => window.location.reload()}>Reintentar</Button>
    </div>
  );
}
