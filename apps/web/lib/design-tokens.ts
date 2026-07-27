/**
 * Fuente de verdad de la paleta de marca de Güau.
 *
 * tailwind.config.ts importa este objeto para armar theme.extend.colors.brand
 * en vez de repetir los hex a mano — antes estaban duplicados acá y en el
 * :root de globals.css, y cambiar uno sin el otro los desincronizaba en
 * silencio, sin que nada fallara.
 *
 * Vive en un .ts neutro, no adentro del config de Tailwind, a propósito:
 * Tailwind es una herramienta exclusivamente web. Un cliente mobile futuro
 * (React Native, etc.) puede importar brandColors tal cual en vez de copiar
 * los valores a mano y arrancar ya desincronizado del resto de la app.
 */
export const brandColors = {
  bg:             "#FAF5EE",
  surface:        "#FFFFFF",
  "surface-sand": "#F7F0E5",
  border:         "#E8DDD0",
  text:           "#1E1B16",
  "text-body":    "#3D3628",
  "text-muted":   "#8B7355",
  primary:        "#C25C2A",
  "primary-soft": "#FFF0E8",
  green:          "#2D5A3D",
  "green-soft":   "#EBF3EE",
  sand:           "#D4A96A",
} as const;
