import { PICKUP_ZONE_MIN_OFFSET_METERS, PICKUP_ZONE_MAX_OFFSET_METERS } from "../constants/index";

const EARTH_RADIUS_METERS = 6371000;

// Hash simple y determinista (FNV-1a de 32 bits) — no hace falta que sea
// criptografico, solo estable y bien distribuido: walkIds parecidos (ej.
// UUIDs correlativos) no pueden dar offsets parecidos, o la zona de dos
// paseos consecutivos del mismo paseador quedaria pegada.
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
 * punto real, en una dirección y distancia que dependen SOLO del `walkId`
 * — mismo paseo, mismo punto aproximado, siempre.
 *
 * Determinista a propósito, nunca aleatorio por request: un offset random
 * en cada consulta dejaría que promediar varias respuestas revele el
 * centro real, y de paso la zona saltaría en la pantalla en cada refresh.
 *
 * Se llama SOLO del lado del servidor, antes de armar la respuesta (ver
 * `toPublicWalk` en `walks.service.ts`) — nunca se manda la coordenada real
 * al cliente para "ocultarla" después: cualquiera lee la respuesta cruda
 * desde las herramientas de desarrollador.
 */
export function approximatePickupPoint(walkId: string, lat: number, lng: number): ApproxPoint {
  const angleHash = hashString(`${walkId}:angle`);
  const distanceHash = hashString(`${walkId}:distance`);

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
