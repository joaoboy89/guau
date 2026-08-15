import {
  approximatePickupPoint,
  PICKUP_ZONE_MIN_OFFSET_METERS,
  PICKUP_ZONE_MAX_OFFSET_METERS,
} from '@guau/shared';

// Tests del desplazamiento determinista anti-desintermediación (bloque B).
// Viven acá y no en packages/shared por la misma razón que walk-timing.spec.ts:
// ese paquete no tiene jest configurado.

const REAL_LAT = -34.5885;
const REAL_LNG = -58.4233;

function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const EARTH_RADIUS_METERS = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(h));
}

describe('approximatePickupPoint (@guau/shared)', () => {
  it('determinista: el mismo walkId y el mismo punto real dan siempre el mismo resultado', () => {
    const first = approximatePickupPoint('walk-1', REAL_LAT, REAL_LNG);
    const second = approximatePickupPoint('walk-1', REAL_LAT, REAL_LNG);
    expect(second).toEqual(first);
  });

  it('la distancia al punto real queda entre el mínimo y el máximo configurados', () => {
    const approx = approximatePickupPoint('walk-1', REAL_LAT, REAL_LNG);
    const d = distanceMeters({ lat: REAL_LAT, lng: REAL_LNG }, approx);
    expect(d).toBeGreaterThanOrEqual(PICKUP_ZONE_MIN_OFFSET_METERS);
    expect(d).toBeLessThan(PICKUP_ZONE_MAX_OFFSET_METERS);
  });

  it('nunca supera el techo de la política: 200 metros', () => {
    // Barre varios walkIds — el offset depende del hash del id, así que un
    // solo caso no alcanza para confiar en el límite superior.
    for (let i = 0; i < 50; i++) {
      const approx = approximatePickupPoint(`walk-${i}`, REAL_LAT, REAL_LNG);
      const d = distanceMeters({ lat: REAL_LAT, lng: REAL_LNG }, approx);
      expect(d).toBeLessThan(200);
    }
  });

  it('walkIds distintos dan puntos aproximados distintos (no colapsan al mismo offset)', () => {
    const a = approximatePickupPoint('walk-a', REAL_LAT, REAL_LNG);
    const b = approximatePickupPoint('walk-b', REAL_LAT, REAL_LNG);
    expect(a).not.toEqual(b);
  });

  it('walkIds parecidos (UUIDs correlativos) no dan offsets pegados', () => {
    const a = approximatePickupPoint('walk-00000001', REAL_LAT, REAL_LNG);
    const b = approximatePickupPoint('walk-00000002', REAL_LAT, REAL_LNG);
    const d = distanceMeters(a, b);
    // No es un límite estricto de la política, pero si dos ids consecutivos
    // dieran casi el mismo punto, la "zona" de paseos consecutivos del mismo
    // paseador quedaría pegada — señal de que el hash no distribuye bien.
    expect(d).toBeGreaterThan(5);
  });
});
