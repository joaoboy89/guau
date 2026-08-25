/**
 * Nombra un grupo de perros para texto de UI/notificaciones. Un paseo tiene
 * un solo dueño (puede meter varios perros suyos) — este helper no resuelve
 * dueños, solo la lista de nombres de UN paseo.
 *
 * Uno: "Lolo". Dos: "Lolo y Mota". Tres o mas: "Lolo y 2 mas" — el nombre
 * completo de cada perro en una lista larga no aporta y alarga el titulo de
 * la notificacion sin necesidad.
 */
export function formatDogsLabel(names: string[]): string {
  if (names.length === 0) return "tu perro";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} y ${names[1]}`;
  return `${names[0]} y ${names.length - 1} más`;
}
