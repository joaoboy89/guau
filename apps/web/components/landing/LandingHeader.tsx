import Link from "next/link";
import { Logo } from "@/components/Logo";
import { Container, buttonStyles } from "@/components/ui";

export default function LandingHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-brand-border/60 bg-brand-bg/85 backdrop-blur">
      <Container width="wide" className="flex h-16 items-center justify-between">
        <Link href="/" className="flex items-center gap-2" aria-label="Güau — inicio">
          <Logo size={36} />
          <span className="font-serif text-xl font-bold text-brand-text">Güau</span>
        </Link>

        <nav className="flex items-center gap-2">
          <Link href="/login" className={buttonStyles({ variant: "ghost", size: "sm" })}>
            Ingresar
          </Link>
          <Link
            href="/register?role=owner"
            className={buttonStyles({ size: "sm", className: "hidden sm:inline-flex" })}
          >
            Crear cuenta
          </Link>
        </nav>
      </Container>
    </header>
  );
}
