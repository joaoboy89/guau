"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import api from "@/lib/api";

type Status = "loading" | "success" | "error";

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const token        = searchParams.get("token");
  const [status, setStatus]   = useState<Status>("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setMessage("El enlace es inválido. No se encontró el token de verificación.");
      return;
    }

    api
      .get(`/auth/verify-email/${token}`)
      .then((res) => {
        setMessage(res.data?.message ?? "Email verificado.");
        setStatus("success");
      })
      .catch((err) => {
        const msg =
          err?.response?.data?.message ??
          "El enlace expiró o ya fue usado. Registrate de nuevo para recibir un email fresco.";
        setMessage(msg);
        setStatus("error");
      });
  }, [token]);

  if (status === "loading") {
    return (
      <main className="min-h-dvh flex items-center justify-center">
        <p className="text-sm animate-pulse" style={{ color: "#8888aa" }}>
          Verificando tu cuenta…
        </p>
      </main>
    );
  }

  if (status === "success") {
    return (
      <main className="min-h-dvh flex flex-col items-center justify-center px-6 text-center gap-6">
        <div
          className="w-16 h-16 rounded-3xl flex items-center justify-center text-3xl"
          style={{ background: "linear-gradient(135deg, #00baad 0%, #4dd2c7 100%)" }}
        >
          ✅
        </div>
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-extrabold tracking-tight">¡Cuenta verificada!</h1>
          <p className="text-sm max-w-xs" style={{ color: "#8888aa" }}>
            {message}
          </p>
        </div>
        <a
          href="/login"
          className="h-12 px-8 flex items-center justify-center rounded-2xl font-semibold text-white"
          style={{ backgroundColor: "#00a89c" }}
        >
          Ingresar a Güau
        </a>
      </main>
    );
  }

  return (
    <main className="min-h-dvh flex flex-col items-center justify-center px-6 text-center gap-6">
      <div
        className="w-16 h-16 rounded-3xl flex items-center justify-center text-3xl"
        style={{ background: "#2a1a1a" }}
      >
        ❌
      </div>
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-extrabold tracking-tight">Enlace inválido</h1>
        <p className="text-sm max-w-xs" style={{ color: "#8888aa" }}>
          {message}
        </p>
      </div>
      <a
        href="/register"
        className="h-12 px-8 flex items-center justify-center rounded-2xl font-semibold text-white"
        style={{ backgroundColor: "#00a89c" }}
      >
        Registrarme de nuevo
      </a>
    </main>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense>
      <VerifyEmailContent />
    </Suspense>
  );
}
