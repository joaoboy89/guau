import type { Metadata } from "next";

// page.tsx de esta ruta es "use client" y un client component no puede
// exportar metadata — por eso el noindex vive acá, en un server component
// que solo envuelve a los hijos. No borrar pensando que sobra: es lo único
// que evita que Google indexe perfiles individuales de paseadores (nombre,
// foto, barrio). El listado en /paseadores sí queda indexable porque no
// expone datos personales en el HTML inicial.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function WalkerProfileLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
