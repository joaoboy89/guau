import { PICKUP_ZONE_MIN_OFFSET_METERS, PICKUP_ZONE_MAX_OFFSET_METERS } from "../constants/index";

const EARTH_RADIUS_METERS = 6371000;

// Hash simple (FNV-1a de 32 bits) — no hace falta que sea criptográfico
// (ver el porqué en el docstring de abajo: la fuerza del hash no es lo que
// protege acá). Sí tiene que estar bien distribuido: walkIds parecidos
// (ej. UUIDs correlativos) no pueden dar offsets parecidos, o la zona de
// dos paseos consecutivos del mismo paseador quedaría pegada.
function hashString(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export interface ApproxPoint {
  lat: number;
  lng: number;
}

/**
 * Punto aproximado del lugar de encuentro — anti-desintermediación (ver
 * docs/guau-politicas.md, "Revelación de la dirección"). Desplazado entre
 * `PICKUP_ZONE_MIN_OFFSET_METERS` y `PICKUP_ZONE_MAX_OFFSET_METERS` del
 * punto real.
 *
 * Dos propiedades DISTINTAS, cada una resuelve un problema distinto — no
 * confundirlas:
 *
 * 1. DETERMINISTA por walkId (mismo paseo, mismo punto aproximado siempre):
 *    resuelve el promediado. Un offset random en cada consulta dejaría que
 *    promediar varias respuestas revele el centro real, y de paso la zona
 *    saltaría en la pantalla en cada refresh.
 *
 * 2. Depende de `secret` (un valor de servidor, nunca expuesto al
 *    cliente): resuelve la reversibilidad. Sin esto, el cálculo dependería
 *    SOLO del walkId — un dato que el propio paseador tiene, porque es su
 *    paseo y viene en la respuesta. Con el algoritmo público (este repo lo
 *    es) y el walkId a la vista, cualquiera recalcula el mismo ángulo y la
 *    misma distancia, los resta del punto aproximado, y obtiene la
 *    dirección exacta con una sola cuenta — sin fuerza bruta. La fuerza del
 *    hash (FNV-1a vs. algo criptográfico) es irrelevante en ese ataque: el
 *    atacante no necesita romper el hash, lo recalcula porque conoce la
 *    entrada. El secreto es lo que le saca esa entrada de las manos.
 *
 * `secret` lo resuelve y lo pasa quien llama (ver
 * `WalksService.validatePickupZoneSecret`) — este paquete no tiene acceso a
 * `ConfigService` de Nest y no debe tenerlo, se mantiene puro.
 *
 * Se llama SOLO del lado del servidor, antes de armar la respuesta (ver
 * `toPublicWalk` en `walks.service.ts`) — nunca se manda la coordenada real
 * al cliente para "ocultarla" después: cualquiera lee la respuesta cruda
 * desde las herramientas de desarrollador.
 */
export function approximatePickupPoint(
  walkId: string,
  lat: number,
  lng: number,
  secret: string,
): ApproxPoint {
  const angleHash = hashString(`${walkId}:${secret}:angle`);
  const distanceHash = hashString(`${walkId}:${secret}:distance`);

  const angleRad = (angleHash % 360) * (Math.PI / 180);
  const offsetRange = PICKUP_ZONE_MAX_OFFSET_METERS - PICKUP_ZONE_MIN_OFFSET_METERS;
  const distanceM = PICKUP_ZONE_MIN_OFFSET_METERS + (distanceHash % offsetRange);

  const latRad = (lat * Math.PI) / 180;
  const deltaLatRad = (distanceM * Math.cos(angleRad)) / EARTH_RADIUS_METERS;
  const deltaLngRad = (distanceM * Math.sin(angleRad)) / (EARTH_RADIUS_METERS * Math.cos(latRad));

  return {
    lat: lat + (deltaLatRad * 180) / Math.PI,
    lng: lng + (deltaLngRad * 180) / Math.PI,
  };
}
