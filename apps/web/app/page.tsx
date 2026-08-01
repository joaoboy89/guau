import Link from "next/link";
import {
  ShieldCheck,
  CreditCard,
  MapPin,
  Search,
  CalendarCheck,
  PawPrint,
  Star,
  Wallet,
  Clock,
} from "lucide-react";
import { Logo } from "@/components/Logo";
import { Container, Badge, buttonStyles } from "@/components/ui";
import PhotoSlot from "@/components/landing/PhotoSlot";
import LandingHeader from "@/components/landing/LandingHeader";

export const metadata = {
  title: "Güau — Paseadores verificados para tu perro en Buenos Aires",
  description:
    "Reservá un paseo con paseadores verificados de tu barrio. Pago online con MercadoPago y comunicación directa. CABA y GBA.",
};

/* ------------------------------------------------------------------ */

function Hero() {
  return (
    <section className="bg-gradient-to-br from-brand-bg to-brand-surface-sand">
      <Container width="wide" as="div" className="py-14 sm:py-20">
        <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
          <div className="flex flex-col items-start gap-6">
            <Badge variant="success" dot>
              Paseadores verificados uno por uno
            </Badge>

            <h1 className="text-balance font-serif text-4xl font-bold leading-[1.1] text-brand-text sm:text-5xl lg:text-6xl">
              Tu perro camina.
              <br />
              Vos, tranquilo.
            </h1>

            <p className="max-w-md text-lg leading-relaxed text-brand-text-body">
              Paseadores de tu barrio, con identidad verificada y horarios
              reales. Reservás en un minuto y pagás online, sin efectivo ni
              coordinaciones eternas por WhatsApp.
            </p>

            <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
              <Link
                href="/paseadores"
                className={buttonStyles({ size: "lg", className: "w-full sm:w-auto" })}
              >
                Buscar paseador
              </Link>
              <Link
                href="/register?role=walker"
                className={buttonStyles({
                  variant: "secondary",
                  size: "lg",
                  className: "w-full sm:w-auto",
                })}
              >
                Quiero pasear perros
              </Link>
            </div>

            <p className="text-sm text-brand-text-muted">
              Capital Federal y Gran Buenos Aires · Gratis para el dueño
            </p>
          </div>

          <div className="overflow-hidden rounded-3xl shadow-float">
            {/* -temp: imagen provisoria hasta la sesión de fotos con la paseadora
                real. El `nota` de abajo sigue siendo el brief de la foto final. */}
            <PhotoSlot
              src="/landing/hero-temp.jpg"
              alt="Paseadora sonriendo, agachada junto a un perro mestizo en una vereda de Buenos Aires"
              width={1000}
              height={1100}
              nota="Foto principal: retrato de paseador/a con un perro, cara visible y mirada a cámara — es la que engancha. Vertical."
              priority
            />
          </div>
        </div>
      </Container>
    </section>
  );
}

/* ------------------------------------------------------------------ */

const señales = [
  {
    icon: ShieldCheck,
    titulo: "Identidad verificada",
    texto:
      "Ningún paseador aparece en la búsqueda hasta que revisamos quién es. La verificación la hacemos nosotros, a mano.",
  },
  {
    icon: CreditCard,
    titulo: "Pago online con MercadoPago",
    texto:
      "Pagás desde la app con tarjeta o dinero en cuenta. Si un paseo no se concreta, gestionamos la devolución.",
  },
  {
    icon: MapPin,
    titulo: "Seguimiento en vivo",
    texto:
      "Vas a poder ver el recorrido de tu perro desde el teléfono, mientras pasea.",
    proximamente: true,
  },
];

function Confianza() {
  return (
    <section className="py-16 sm:py-20">
      <Container width="wide">
        <h2 className="mb-3 text-balance font-serif text-3xl font-bold text-brand-text sm:text-4xl">
          Alguien de confianza para el mejor momento de su día.
        </h2>
        <p className="mb-10 max-w-2xl text-lg text-brand-text-body">
          Por eso Güau se construyó alrededor de una sola idea: que sepas
          exactamente con quién está tu perro y qué está pasando.
        </p>

        <ul className="grid gap-6 sm:grid-cols-3">
          {señales.map(({ icon: Icon, titulo, texto, proximamente }) => (
            <li
              key={titulo}
              className="flex flex-col gap-3 rounded-2xl border border-brand-border bg-brand-surface p-6 shadow-card"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-primary-soft text-brand-primary">
                <Icon size={22} strokeWidth={1.75} aria-hidden="true" />
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-serif text-lg font-bold text-brand-text">
                  {titulo}
                </h3>
                {proximamente && <Badge variant="default">Muy pronto</Badge>}
              </div>
              <p className="text-sm leading-relaxed text-brand-text-body">{texto}</p>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}

/* ------------------------------------------------------------------ */

const pasos = [
  {
    icon: Search,
    titulo: "Elegí paseador",
    texto:
      "Mirá perfiles de tu zona con su experiencia, cuántos perros lleva por paseo y en qué horarios trabaja de verdad.",
  },
  {
    icon: CalendarCheck,
    titulo: "Reservá y pagá",
    texto:
      "Elegís día, hora y dirección. El paseador confirma, y recién ahí pagás online. Sin señas ni transferencias a ciegas.",
  },
  {
    icon: PawPrint,
    titulo: "A caminar",
    texto:
      "Tu perro sale a pasear. Te llegan avisos cuando el paseo arranca y cuando termina, y después podés dejar tu reseña.",
  },
];

function ComoFunciona() {
  return (
    <section id="como-funciona" className="border-y border-brand-border bg-brand-surface-sand py-16 sm:py-20">
      <Container width="wide">
        <h2 className="mb-10 text-balance font-serif text-3xl font-bold text-brand-text sm:text-4xl">
          Cómo funciona
        </h2>

        <ol className="grid gap-8 sm:grid-cols-3">
          {pasos.map(({ icon: Icon, titulo, texto }, i) => (
            <li key={titulo} className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-primary font-serif text-lg font-bold text-white">
                  {i + 1}
                </span>
                <Icon
                  size={22}
                  strokeWidth={1.75}
                  className="text-brand-text-muted"
                  aria-hidden="true"
                />
              </div>
              <h3 className="font-serif text-xl font-bold text-brand-text">{titulo}</h3>
              <p className="leading-relaxed text-brand-text-body">{texto}</p>
            </li>
          ))}
        </ol>

        <div className="mt-10">
          <Link href="/paseadores" className={buttonStyles({ size: "lg" })}>
            Empezar ahora
          </Link>
        </div>
      </Container>
    </section>
  );
}

/* ------------------------------------------------------------------ */

const beneficiosWalker = [
  {
    icon: Wallet,
    texto:
      "Cobrás en tu propia cuenta de MercadoPago, apenas el dueño paga. Güau no retiene tu plata.",
  },
  {
    icon: Clock,
    texto:
      "Cargás tus horarios reales y solo te llegan solicitudes cuando estás disponible.",
  },
  {
    icon: Star,
    texto:
      "Cada paseo suma reseñas y reputación, que es lo que te trae los próximos clientes.",
  },
];

function ParaPaseadores() {
  return (
    <section id="paseadores" className="py-16 sm:py-20">
      <Container width="wide">
        <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
          <div className="order-2 overflow-hidden rounded-3xl shadow-card lg:order-1">
            {/* -temp: imagen provisoria, ver comentario del hero. */}
            <PhotoSlot
              src="/landing/accion-temp.jpg"
              alt="Paseador caminando con tres perros por una vereda arbolada de Buenos Aires"
              width={900}
              height={700}
              nota="Foto de acción: paseador caminando con perros, plano abierto con calle de fondo. Contrasta con el hero, que es cercano y estático. Horizontal."
            />
          </div>

          <div className="order-1 flex flex-col items-start gap-6 lg:order-2">
            <Badge variant="info">Para paseadores</Badge>

            <h2 className="text-balance font-serif text-3xl font-bold text-brand-text sm:text-4xl">
              ¿Paseás perros? Hacelo con respaldo.
            </h2>

            <p className="max-w-md text-lg leading-relaxed text-brand-text-body">
              Güau te consigue clientes de tu zona y se encarga de la parte
              incómoda: el cobro, la agenda y la confianza inicial. Vos ponés lo
              que sabés hacer.
            </p>

            <ul className="flex flex-col gap-4">
              {beneficiosWalker.map(({ icon: Icon, texto }) => (
                <li key={texto} className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-green-soft text-brand-green">
                    <Icon size={18} strokeWidth={1.75} aria-hidden="true" />
                  </span>
                  <span className="leading-relaxed text-brand-text-body">{texto}</span>
                </li>
              ))}
            </ul>

            <Link
              href="/register?role=walker"
              className={buttonStyles({ size: "lg", className: "w-full sm:w-auto" })}
            >
              Sumarme como paseador
            </Link>
          </div>
        </div>
      </Container>
    </section>
  );
}

/* ------------------------------------------------------------------ */

function CierreCTA() {
  return (
    <section className="border-t border-brand-border bg-brand-surface-sand py-16 sm:py-20">
      <Container width="content" className="flex flex-col items-center gap-6 text-center">
        <Logo size={56} />
        <h2 className="text-balance font-serif text-3xl font-bold text-brand-text sm:text-4xl">
          Tu perro merece una buena caminata hoy
        </h2>
        <p className="max-w-lg text-lg text-brand-text-body">
          Crear la cuenta es gratis y toma menos de dos minutos.
        </p>
        <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
          <Link
            href="/register?role=owner"
            className={buttonStyles({ size: "lg", className: "w-full sm:w-auto" })}
          >
            Soy dueño
          </Link>
          <Link
            href="/register?role=walker"
            className={buttonStyles({
              variant: "secondary",
              size: "lg",
              className: "w-full sm:w-auto",
            })}
          >
            Soy paseador
          </Link>
        </div>
      </Container>
    </section>
  );
}

/* ------------------------------------------------------------------ */

function Footer() {
  return (
    <footer className="border-t border-brand-border py-10">
      <Container
        width="wide"
        className="flex flex-col items-center justify-between gap-6 sm:flex-row"
      >
        <div className="flex items-center gap-2">
          <Logo size={28} />
          <span className="font-serif font-bold text-brand-text">Güau</span>
        </div>

        <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-brand-text-body">
          <Link href="#como-funciona" className="hover:text-brand-primary">
            Cómo funciona
          </Link>
          <Link href="#paseadores" className="hover:text-brand-primary">
            Para paseadores
          </Link>
          <Link href="/login" className="hover:text-brand-primary">
            Ingresar
          </Link>
        </nav>

        <p className="text-sm text-brand-text-muted">
          Buenos Aires, Argentina · © {new Date().getFullYear()} Güau
        </p>
      </Container>
    </footer>
  );
}

/* ------------------------------------------------------------------ */

export default function Home() {
  return (
    <div className="flex min-h-dvh flex-col bg-brand-bg">
      <LandingHeader />
      <main className="flex-1">
        <Hero />
        <Confianza />
        <ComoFunciona />
        <ParaPaseadores />
        <CierreCTA />
      </main>
      <Footer />
    </div>
  );
}
