/**
 * Lista estática de barrios (CABA) y localidades (GBA) con un centroide cada
 * uno, para alimentar el selector de zona en /paseadores y en la reserva de
 * un paseo.
 *
 * Esto es PROVISIONAL hasta integrar geocodificación real con Mapbox (ya es
 * dependencia del proyecto — mapbox-gl / @mapbox/mapbox-gl-geocoder están
 * instalados sin usar, a la espera de esa feature). Geocodificar la
 * dirección que escribe el dueño es un problema distinto del tracking GPS en
 * vivo del paseo: acá alcanza con un punto aproximado por barrio porque el
 * radio de cobertura del paseador se mide en kilómetros, no en metros.
 *
 * FIABILIDAD DE LAS COORDENADAS — no es uniforme, y es importante no tratar
 * todo el archivo como si lo fuera:
 *
 * - Los 48 barrios de CABA usan centroides OFICIALES: calculados a partir de
 *   los polígonos del dataset "Barrios" de Buenos Aires Data (licencia
 *   CC-BY-2.5-AR, actualización trimestral).
 *   https://data.buenosaires.gob.ar/dataset/barrios
 *   El cálculo es el centroide de área de cada polígono (fórmula de
 *   shoelace, con las islas/huecos del polígono restando en vez de sumar),
 *   no el promedio de sus vértices.
 * - Las 36 localidades de GBA siguen siendo ESTIMACIONES aproximadas (el
 *   dataset de Buenos Aires Data cubre solo Ciudad de Buenos Aires, no la
 *   provincia). No hay una fuente oficial equivalente todavía integrada acá.
 */

export type Barrio = {
  nombre: string;
  lat: number;
  lng: number;
  zona: "CABA" | "GBA";
};

export const BARRIOS: Barrio[] = [
  // ─── CABA (48 barrios, centroides OFICIALES — ver fuente arriba) ────────
  { nombre: "Agronomía", lat: -34.5930, lng: -58.4887, zona: "CABA" },
  { nombre: "Almagro", lat: -34.6092, lng: -58.4217, zona: "CABA" },
  { nombre: "Balvanera", lat: -34.6091, lng: -58.4031, zona: "CABA" },
  { nombre: "Barracas", lat: -34.6464, lng: -58.3843, zona: "CABA" },
  { nombre: "Belgrano", lat: -34.5547, lng: -58.4501, zona: "CABA" },
  { nombre: "Boedo", lat: -34.6300, lng: -58.4188, zona: "CABA" },
  { nombre: "Caballito", lat: -34.6168, lng: -58.4436, zona: "CABA" },
  { nombre: "Chacarita", lat: -34.5884, lng: -58.4542, zona: "CABA" },
  { nombre: "Coghlan", lat: -34.5606, lng: -58.4749, zona: "CABA" },
  { nombre: "Colegiales", lat: -34.5746, lng: -58.4510, zona: "CABA" },
  { nombre: "Constitución", lat: -34.6250, lng: -58.3844, zona: "CABA" },
  { nombre: "Flores", lat: -34.6368, lng: -58.4583, zona: "CABA" },
  { nombre: "Floresta", lat: -34.6277, lng: -58.4836, zona: "CABA" },
  { nombre: "La Boca", lat: -34.6311, lng: -58.3568, zona: "CABA" },
  { nombre: "La Paternal", lat: -34.5974, lng: -58.4687, zona: "CABA" },
  { nombre: "Liniers", lat: -34.6438, lng: -58.5191, zona: "CABA" },
  { nombre: "Mataderos", lat: -34.6584, lng: -58.5017, zona: "CABA" },
  { nombre: "Monserrat", lat: -34.6127, lng: -58.3797, zona: "CABA" },
  { nombre: "Monte Castro", lat: -34.6193, lng: -58.5066, zona: "CABA" },
  { nombre: "Nueva Pompeya", lat: -34.6505, lng: -58.4189, zona: "CABA" },
  { nombre: "Núñez", lat: -34.5433, lng: -58.4626, zona: "CABA" },
  { nombre: "Palermo", lat: -34.5738, lng: -58.4223, zona: "CABA" },
  { nombre: "Parque Avellaneda", lat: -34.6486, lng: -58.4765, zona: "CABA" },
  { nombre: "Parque Chacabuco", lat: -34.6359, lng: -58.4377, zona: "CABA" },
  { nombre: "Parque Chas", lat: -34.5855, lng: -58.4791, zona: "CABA" },
  { nombre: "Parque Patricios", lat: -34.6376, lng: -58.4017, zona: "CABA" },
  { nombre: "Puerto Madero", lat: -34.6091, lng: -58.3557, zona: "CABA" },
  { nombre: "Recoleta", lat: -34.5856, lng: -58.3947, zona: "CABA" },
  { nombre: "Retiro", lat: -34.5884, lng: -58.3760, zona: "CABA" },
  { nombre: "Saavedra", lat: -34.5531, lng: -58.4887, zona: "CABA" },
  { nombre: "San Cristóbal", lat: -34.6239, lng: -58.4019, zona: "CABA" },
  { nombre: "San Nicolás", lat: -34.6037, lng: -58.3805, zona: "CABA" },
  { nombre: "San Telmo", lat: -34.6215, lng: -58.3715, zona: "CABA" },
  { nombre: "Vélez Sarsfield", lat: -34.6314, lng: -58.4933, zona: "CABA" },
  { nombre: "Versalles", lat: -34.6301, lng: -58.5224, zona: "CABA" },
  { nombre: "Villa Crespo", lat: -34.5988, lng: -58.4427, zona: "CABA" },
  { nombre: "Villa del Parque", lat: -34.6043, lng: -58.4907, zona: "CABA" },
  { nombre: "Villa Devoto", lat: -34.6024, lng: -58.5143, zona: "CABA" },
  { nombre: "Villa General Mitre", lat: -34.6100, lng: -58.4689, zona: "CABA" },
  { nombre: "Villa Lugano", lat: -34.6750, lng: -58.4762, zona: "CABA" },
  { nombre: "Villa Luro", lat: -34.6364, lng: -58.5027, zona: "CABA" },
  { nombre: "Villa Ortúzar", lat: -34.5810, lng: -58.4677, zona: "CABA" },
  { nombre: "Villa Pueyrredón", lat: -34.5821, lng: -58.5035, zona: "CABA" },
  { nombre: "Villa Real", lat: -34.6195, lng: -58.5260, zona: "CABA" },
  { nombre: "Villa Riachuelo", lat: -34.6919, lng: -58.4633, zona: "CABA" },
  { nombre: "Villa Santa Rita", lat: -34.6162, lng: -58.4830, zona: "CABA" },
  { nombre: "Villa Soldati", lat: -34.6654, lng: -58.4466, zona: "CABA" },
  { nombre: "Villa Urquiza", lat: -34.5715, lng: -58.4879, zona: "CABA" },

  // ─── GBA (localidades más pobladas, zona norte/oeste/sur) — ESTIMADAS,
  // no oficiales. El dataset de Buenos Aires Data no cubre la provincia. ──
  { nombre: "Adrogué", lat: -34.7990, lng: -58.3890, zona: "GBA" },
  { nombre: "Avellaneda", lat: -34.6620, lng: -58.3650, zona: "GBA" },
  { nombre: "Banfield", lat: -34.7440, lng: -58.3960, zona: "GBA" },
  { nombre: "Béccar", lat: -34.4700, lng: -58.5470, zona: "GBA" },
  { nombre: "Berazategui", lat: -34.7640, lng: -58.2120, zona: "GBA" },
  { nombre: "Boulogne", lat: -34.5060, lng: -58.5650, zona: "GBA" },
  { nombre: "Castelar", lat: -34.6510, lng: -58.6440, zona: "GBA" },
  { nombre: "Escobar", lat: -34.3480, lng: -58.7920, zona: "GBA" },
  { nombre: "Ezeiza", lat: -34.8280, lng: -58.5320, zona: "GBA" },
  { nombre: "Florencio Varela", lat: -34.8180, lng: -58.2760, zona: "GBA" },
  { nombre: "Haedo", lat: -34.6400, lng: -58.5920, zona: "GBA" },
  { nombre: "Hurlingham", lat: -34.5900, lng: -58.6370, zona: "GBA" },
  { nombre: "Ituzaingó", lat: -34.6600, lng: -58.6700, zona: "GBA" },
  { nombre: "José C. Paz", lat: -34.5140, lng: -58.7530, zona: "GBA" },
  { nombre: "Lanús", lat: -34.7060, lng: -58.3940, zona: "GBA" },
  { nombre: "Lomas de Zamora", lat: -34.7610, lng: -58.4060, zona: "GBA" },
  { nombre: "Malvinas Argentinas", lat: -34.4900, lng: -58.7100, zona: "GBA" },
  { nombre: "Martínez", lat: -34.4930, lng: -58.5090, zona: "GBA" },
  { nombre: "Merlo", lat: -34.6650, lng: -58.7280, zona: "GBA" },
  { nombre: "Monte Grande", lat: -34.8180, lng: -58.4620, zona: "GBA" },
  { nombre: "Moreno", lat: -34.6350, lng: -58.7900, zona: "GBA" },
  { nombre: "Morón", lat: -34.6530, lng: -58.6200, zona: "GBA" },
  { nombre: "Munro", lat: -34.5280, lng: -58.5170, zona: "GBA" },
  { nombre: "Nordelta", lat: -34.4020, lng: -58.6570, zona: "GBA" },
  { nombre: "Olivos", lat: -34.5100, lng: -58.4900, zona: "GBA" },
  { nombre: "Pilar", lat: -34.4590, lng: -58.9140, zona: "GBA" },
  { nombre: "Quilmes", lat: -34.7200, lng: -58.2680, zona: "GBA" },
  { nombre: "Ramos Mejía", lat: -34.6470, lng: -58.5630, zona: "GBA" },
  { nombre: "San Fernando", lat: -34.4420, lng: -58.5590, zona: "GBA" },
  { nombre: "San Isidro", lat: -34.4730, lng: -58.5070, zona: "GBA" },
  { nombre: "San Justo", lat: -34.6820, lng: -58.5580, zona: "GBA" },
  { nombre: "San Miguel", lat: -34.5420, lng: -58.7120, zona: "GBA" },
  { nombre: "Tigre", lat: -34.4260, lng: -58.5800, zona: "GBA" },
  { nombre: "Tres de Febrero", lat: -34.6070, lng: -58.5620, zona: "GBA" },
  { nombre: "Vicente López", lat: -34.5270, lng: -58.4790, zona: "GBA" },
  { nombre: "Wilde", lat: -34.7050, lng: -58.3300, zona: "GBA" },
];

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/**
 * Barrio cuyo centroide está más cerca de un punto dado. Es el inverso
 * exacto de cómo se guarda la zona ahora: el selector de zona escribe el
 * centroide de un barrio elegido (ver BarrioSelect + set-zone), así que
 * encontrar el barrio más cercano a esas coordenadas no es una adivinanza —
 * recupera exactamente lo que se declaró.
 */
export function findNearestBarrio(lat: number, lng: number): Barrio {
  return BARRIOS.reduce((closest, b) =>
    haversineKm(lat, lng, b.lat, b.lng) < haversineKm(lat, lng, closest.lat, closest.lng) ? b : closest
  );
}
