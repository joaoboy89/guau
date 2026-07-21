import Link from "next/link";
import { Logo } from "@/components/Logo";

export default function Home() {
  return (
    <main className="flex flex-col items-center justify-center min-h-dvh px-6 text-center gap-8 bg-brand-bg">

      <div className="flex flex-col items-center gap-3">
        <Logo size={80} />
        <h1 className="text-4xl font-serif font-bold text-brand-text">Güau</h1>
        <p className="text-sm max-w-xs text-brand-text-muted">
          Paseadores verificados para tu perro en Buenos Aires
        </p>
      </div>

      <div className="flex flex-col gap-3 w-full max-w-xs">
        <Link
          href="/login"
          className="w-full h-12 flex items-center justify-center text-white font-semibold rounded-2xl bg-brand-primary transition-opacity hover:opacity-90"
        >
          Ingresar
        </Link>
      </div>

      <div className="flex flex-col gap-3 w-full max-w-xs">
        <p className="text-sm font-medium text-brand-text-body">Crear cuenta</p>
        <div className="grid grid-cols-2 gap-3">
          <Link
            href="/register?role=owner"
            className="h-16 flex flex-col items-center justify-center gap-1 font-semibold rounded-2xl border border-brand-border text-brand-text-body bg-brand-surface transition-opacity hover:opacity-80"
          >
            <span aria-hidden="true">🐕</span>
            Soy dueño
          </Link>
          <Link
            href="/register?role=walker"
            className="h-16 flex flex-col items-center justify-center gap-1 font-semibold rounded-2xl border border-brand-border text-brand-text-body bg-brand-surface transition-opacity hover:opacity-80"
          >
            <span aria-hidden="true">🐾</span>
            Soy paseador
          </Link>
        </div>
      </div>

    </main>
  );
}
