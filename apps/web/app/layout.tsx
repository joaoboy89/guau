import type { Metadata, Viewport } from "next";
import { Lora, DM_Sans } from "next/font/google";
import { AuthHydrator } from "@/components/AuthHydrator";
import "./globals.css";

const lora = Lora({
  subsets:  ["latin"],
  variable: "--font-lora",
  weight:   ["400", "700"],
  display:  "swap",
});

const dmSans = DM_Sans({
  subsets:  ["latin"],
  variable: "--font-dm-sans",
  weight:   ["400", "500", "600", "700"],
  display:  "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://guau.jbsaasapp.com"),
  title:       "Güau — Paseo de perros",
  description: "Encontrá el paseador ideal para tu perro en Buenos Aires.",
  manifest:    "/manifest.json",
  appleWebApp: {
    capable:         true,
    statusBarStyle:  "default",
    title:           "Güau",
  },
  openGraph: {
    title:       "Güau",
    description: "Marketplace de paseo de perros para CABA y GBA",
    type:        "website",
    locale:      "es_AR",
    url:         "/",
    images: [
      {
        url:    "/og-image.png",
        width:  1200,
        height: 630,
        alt:    "Güau — Paseadores verificados para tu perro en Buenos Aires",
      },
    ],
  },
  twitter: {
    card:        "summary_large_image",
    title:       "Güau",
    description: "Marketplace de paseo de perros para CABA y GBA",
    images:      ["/og-image.png"],
  },
};

export const viewport: Viewport = {
  width:        "device-width",
  initialScale: 1,
  // `maximumScale: 1` + `userScalable: false` estaban bloqueando el zoom con
  // dos dedos en mobile. Es un patrón heredado de apps viejas (evitaba el
  // auto-zoom de iOS al enfocar un input), pero incumple WCAG 1.4.4: alguien
  // con baja visión no puede agrandar el texto. El auto-zoom de iOS se evita
  // sin romper nada usando inputs de 16px o más, que es lo que ya hacemos.
  themeColor:  "#FAF5EE",
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es-AR" className={`${lora.variable} ${dmSans.variable}`}>
      <head>
        <link rel="apple-touch-icon" href="/icons/icon-192x192.png" />
        <meta name="mobile-web-app-capable" content="yes" />
      </head>
      <body className="antialiased font-sans bg-brand-bg text-brand-text">
        <AuthHydrator />
        {children}
      </body>
    </html>
  );
}
