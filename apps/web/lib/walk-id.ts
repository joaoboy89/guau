// Convención del id corto de un paseo (docs/diseños/modulo-soporte.md §4):
// los primeros 8 caracteres del UUID. Se lee por teléfono, se copia de un
// vistazo — mismo criterio que Uber/Cabify. Un solo lugar: si el recorte
// cambia alguna vez, cambia acá y en los dos lados que lo muestran.
export function shortWalkId(id: string): string {
  return id.slice(0, 8);
}
