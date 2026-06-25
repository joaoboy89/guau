/**
 * Página raíz — splash screen de Güau.
 * En producción redirigirá según estado de auth (client-side).
 */

import Link from "next/link";

export default function Home() {
  return (
    <main className="flex flex-col items-center justify-center min-h-dvh px-6 text-center gap-8">
      {/* Logo */}
      <div className="flex flex-col items-center gap-3">
        <div
          className="w-20 h-20 rounded-3xl flex items-center justify-center shadow-float text-4xl select-none"
          style={{ background: "linear-gradient(135deg, #00baad 0%, #4dd2c7 100%)" }}
        >
          🐾
        </div>
        <h1 className="text-4xl font-extrabold tracking-tight">
          Gü<span style={{ color: "#00a89c" }}>au</span>
        </h1>
        <p className="text-sm max-w-xs" style={{ color: "#8888aa" }}>
          Paseadores verificados para tu perro en Buenos Aires
        </p>
      </div>

      {/* CTAs */}
      <div className="flex flex-col gap-3 w-full max-w-xs">
        <Link
          href="/login"
          className="w-full h-12 flex items-center justify-center text-white font-semibold rounded-2xl transition-colors"
          style={{ backgroundColor: "#00a89c" }}
        >
          Ingresar
        </Link>
        <Link
          href="/register"
          className="w-full h-12 flex items-center justify-center font-semibold rounded-2xl border transition-colors"
          style={{ backgroundColor: "#22223a", borderColor: "#2e2e4a", color: "#f0f0f8" }}
        >
          Crear cuenta
        </Link>
      </div>

      <p className="text-xs" style={{ color: "#8888aa" }}>
        ¿Querés ser paseador?{" "}
        <Link href="/register?role=walker" style={{ color: "#00a89c" }} className="underline">
          Registrarte acá
        </Link>
      </p>
    </main>
  );
}
