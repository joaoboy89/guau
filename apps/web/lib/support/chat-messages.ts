// Dos hechos del mundo distintos, y una disputa puede depender de cuál de
// los dos pasó (docs/diseños/modulo-soporte.md, hallazgo del testeo en
// staging 2026-09-11): que un canal haya EXISTIDO y nadie lo haya usado es
// evidencia contra "no te escribí porque no podía". Que nunca haya existido,
// no. La API distingue los dos casos con `conversationExists`; esta función
// decide el texto, cada uno diciendo el hecho, no el síntoma (los dos daban
// "no hay mensajes" antes de esto).
export function getEmptyChatMessage(conversationExists: boolean): string {
  return conversationExists
    ? "La conversación existe, pero ninguna de las partes escribió."
    : "Este paseo no llegó a tener conversación — nunca se confirmó, así que el canal nunca se abrió.";
}
