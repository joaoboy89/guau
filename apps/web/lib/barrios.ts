/**
 * Catálogo de localidades (CABA + partidos del GBA) con un centroide cada
 * una, para alimentar el selector de zona en /paseadores y en la reserva de
 * un paseo.
 *
 * Esto es PROVISIONAL hasta integrar geocodificación real con Mapbox (ya es
 * dependencia del proyecto — mapbox-gl / @mapbox/mapbox-gl-geocoder están
 * instalados sin usar, a la espera de esa feature). Geocodificar la
 * dirección que escribe el dueño es un problema distinto del tracking GPS en
 * vivo del paseo: acá alcanza con un punto aproximado por localidad porque
 * el radio de cobertura del paseador se mide en kilómetros, no en metros.
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
 * - El resto (localidades de los partidos del GBA) siguen siendo
 *   ESTIMACIONES aproximadas (el dataset de Buenos Aires Data cubre solo
 *   Ciudad de Buenos Aires, no la provincia). No hay una fuente oficial
 *   equivalente todavía integrada acá.
 */

export type Barrio = {
  nombre: string;
  lat: number;
  lng: number;
  /**
   * Partido (o "Ciudad de Buenos Aires") al que pertenece la localidad —
   * TODAS las entradas de este archivo son localidades de un mismo nivel;
   * `partido` es el agrupador real, no una zona inventada (antes se
   * mezclaban partido y localidad: "Vicente López" y "San Isidro" eran
   * partido Y localidad a la vez). Cuando el catálogo se mueva a la base,
   * este campo pasa a ser la columna de ciudad/región.
   */
  partido: string;
  /**
   * Si Güau opera hoy en esta localidad. La mayoría del catálogo existe
   * pero está apagada: ofrecer 91 opciones cuando la cobertura real es de
   * 57 lleva a elegir una zona vacía y concluir que la app no funciona —
   * mismo error que el radio de 20 km. Las inactivas quedan cargadas (con
   * coordenadas y partido ya resueltos) para poder encenderlas sin tener
   * que volver a armar el dato.
   */
  activa: boolean;
};

export const BARRIOS: Barrio[] = [
  // ─── Ciudad de Buenos Aires (48 barrios, centroides OFICIALES) ──────────
  // Activos todos menos Barracas, Nueva Pompeya, Villa Riachuelo y Villa
  // Soldati — fuera de la cobertura actual, quedan cargados para cuando se
  // sumen.
  { nombre: "Agronomía", lat: -34.5930, lng: -58.4887, partido: "Ciudad de Buenos Aires", activa: true },
  { nombre: "Almagro", lat: -34.6092, lng: -58.4217, partido: "Ciudad de Buenos Aires", activa: true },
  { nombre: "Balvanera", lat: -34.6091, lng: -58.4031, partido: "Ciudad de Buenos Aires", activa: true },
  { nombre: "Barracas", lat: -34.6464, lng: -58.3843, partido: "Ciudad de Buenos Aires", activa: false },
  { nombre: "Belgrano", lat: -34.5547, lng: -58.4501, partido: "Ciudad de Buenos Aires", activa: true },
  { nombre: "Boedo", lat: -34.6300, lng: -58.4188, partido: "Ciudad de Buenos Aires", activa: true },
  { nombre: "Caballito", lat: -34.6168, lng: -58.4436, partido: "Ciudad de Buenos Aires", activa: true },
  { nombre: "Chacarita", lat: -34.5884, lng: -58.4542, partido: "Ciudad de Buenos Aires", activa: true },
  { nombre: "Coghlan", lat: -34.5606, lng: -58.4749, partido: "Ciudad de Buenos Aires", activa: true },
  { nombre: "Colegiales", lat: -34.5746, lng: -58.4510, partido: "Ciudad de Buenos Aires", activa: true },
  { nombre: "Constitución", lat: -34.6250, lng: -58.3844, partido: "Ciudad de Buenos Aires", activa: true },
  { nombre: "Flores", lat: -34.6368, lng: -58.4583, partido: "Ciudad de Buenos Aires", activa: true },
  { nombre: "Floresta", lat: -34.6277, lng: -58.4836, partido: "Ciudad de Buenos Aires", activa: true },
  { nombre: "La Boca", lat: -34.6311, lng: -58.3568, partido: "Ciudad de Buenos Aires", activa: true },
  { nombre: "La Paternal", lat: -34.5974, lng: -58.4687, partido: "Ciudad de Buenos Aires", activa: true },
  { nombre: "Liniers", lat: -34.6438, lng: -58.5191, partido: "Ciudad de Buenos Aires", activa: true },
  { nombre: "Mataderos", lat: -34.6584, lng: -58.5017, partido: "Ciudad de Buenos Aires", activa: true },
  { nombre: "Monserrat", lat: -34.6127, lng: -58.3797, partido: "Ciudad de Buenos Aires", activa: true },
  { nombre: "Monte Castro", lat: -34.6193, lng: -58.5066, partido: "Ciudad de Buenos Aires", activa: true },
  { nombre: "Nueva Pompeya", lat: -34.6505, lng: -58.4189, partido: "Ciudad de Buenos Aires", activa: false },
  { nombre: "Núñez", lat: -34.5433, lng: -58.4626, partido: "Ciudad de Buenos Aires", activa: true },
  { nombre: "Palermo", lat: -34.5738, lng: -58.4223, partido: "Ciudad de Buenos Aires", activa: true },
  { nombre: "Parque Avellaneda", lat: -34.6486, lng: -58.4765, partido: "Ciudad de Buenos Aires", activa: true },
  { nombre: "Parque Chacabuco", lat: -34.6359, lng: -58.4377, partido: "Ciudad de Buenos Aires", activa: true },
  { nombre: "Parque Chas", lat: -34.5855, lng: -58.4791, partido: "Ciudad de Buenos Aires", activa: true },
  { nombre: "Parque Patricios", lat: -34.6376, lng: -58.4017, partido: "Ciudad de Buenos Aires", activa: true },
  { nombre: "Puerto Madero", lat: -34.6091, lng: -58.3557, partido: "Ciudad de Buenos Aires", activa: true },
  { nombre: "Recoleta", lat: -34.5856, lng: -58.3947, partido: "Ciudad de Buenos Aires", activa: true },
  { nombre: "Retiro", lat: -34.5884, lng: -58.3760, partido: "Ciudad de Buenos Aires", activa: true },
  { nombre: "Saavedra", lat: -34.5531, lng: -58.4887, partido: "Ciudad de Buenos Aires", activa: true },
  { nombre: "San Cristóbal", lat: -34.6239, lng: -58.4019, partido: "Ciudad de Buenos Aires", activa: true },
  { nombre: "San Nicolás", lat: -34.6037, lng: -58.3805, partido: "Ciudad de Buenos Aires", activa: true },
  { nombre: "San Telmo", lat: -34.6215, lng: -58.3715, partido: "Ciudad de Buenos Aires", activa: true },
  { nombre: "Vélez Sarsfield", lat: -34.6314, lng: -58.4933, partido: "Ciudad de Buenos Aires", activa: true },
  { nombre: "Versalles", lat: -34.6301, lng: -58.5224, partido: "Ciudad de Buenos Aires", activa: true },
  { nombre: "Villa Crespo", lat: -34.5988, lng: -58.4427, partido: "Ciudad de Buenos Aires", activa: true },
  { nombre: "Villa del Parque", lat: -34.6043, lng: -58.4907, partido: "Ciudad de Buenos Aires", activa: true },
  { nombre: "Villa Devoto", lat: -34.6024, lng: -58.5143, partido: "Ciudad de Buenos Aires", activa: true },
  { nombre: "Villa General Mitre", lat: -34.6100, lng: -58.4689, partido: "Ciudad de Buenos Aires", activa: true },
  { nombre: "Villa Lugano", lat: -34.6750, lng: -58.4762, partido: "Ciudad de Buenos Aires", activa: true },
  { nombre: "Villa Luro", lat: -34.6364, lng: -58.5027, partido: "Ciudad de Buenos Aires", activa: true },
  { nombre: "Villa Ortúzar", lat: -34.5810, lng: -58.4677, partido: "Ciudad de Buenos Aires", activa: true },
  { nombre: "Villa Pueyrredón", lat: -34.5821, lng: -58.5035, partido: "Ciudad de Buenos Aires", activa: true },
  { nombre: "Villa Real", lat: -34.6195, lng: -58.5260, partido: "Ciudad de Buenos Aires", activa: true },
  { nombre: "Villa Riachuelo", lat: -34.6919, lng: -58.4633, partido: "Ciudad de Buenos Aires", activa: false },
  { nombre: "Villa Santa Rita", lat: -34.6162, lng: -58.4830, partido: "Ciudad de Buenos Aires", activa: true },
  { nombre: "Villa Soldati", lat: -34.6654, lng: -58.4466, partido: "Ciudad de Buenos Aires", activa: false },
  { nombre: "Villa Urquiza", lat: -34.5715, lng: -58.4879, partido: "Ciudad de Buenos Aires", activa: true },

  // ─── Partido de Vicente López (8 localidades, todas activas) ────────────
  { nombre: "Carapachay", lat: -34.5180, lng: -58.5280, partido: "Vicente López", activa: true },
  { nombre: "Florida", lat: -34.5350, lng: -58.4950, partido: "Vicente López", activa: true },
  { nombre: "Florida Oeste", lat: -34.5380, lng: -58.5100, partido: "Vicente López", activa: true },
  { nombre: "La Lucila", lat: -34.5020, lng: -58.4850, partido: "Vicente López", activa: true },
  { nombre: "Munro", lat: -34.5280, lng: -58.5170, partido: "Vicente López", activa: true },
  { nombre: "Olivos", lat: -34.5100, lng: -58.4900, partido: "Vicente López", activa: true },
  { nombre: "Vicente López", lat: -34.5270, lng: -58.4790, partido: "Vicente López", activa: true },
  { nombre: "Villa Martelli", lat: -34.5450, lng: -58.4950, partido: "Vicente López", activa: true },

  // ─── Partido de San Isidro (6 localidades — Boulogne NO está activa) ────
  { nombre: "Acassuso", lat: -34.4800, lng: -58.5010, partido: "San Isidro", activa: true },
  { nombre: "Béccar", lat: -34.4700, lng: -58.5470, partido: "San Isidro", activa: true },
  { nombre: "Boulogne", lat: -34.5060, lng: -58.5650, partido: "San Isidro", activa: false },
  { nombre: "Martínez", lat: -34.4930, lng: -58.5090, partido: "San Isidro", activa: true },
  { nombre: "San Isidro", lat: -34.4730, lng: -58.5070, partido: "San Isidro", activa: true },
  { nombre: "Villa Adelina", lat: -34.5050, lng: -58.5480, partido: "San Isidro", activa: true },

  // ─── Resto del GBA — ESTIMADAS, ninguna activa todavía ───────────────────
  { nombre: "Adrogué", lat: -34.7990, lng: -58.3890, partido: "Almirante Brown", activa: false },
  { nombre: "Avellaneda", lat: -34.6620, lng: -58.3650, partido: "Avellaneda", activa: false },
  { nombre: "Banfield", lat: -34.7440, lng: -58.3960, partido: "Lomas de Zamora", activa: false },
  { nombre: "Berazategui", lat: -34.7640, lng: -58.2120, partido: "Berazategui", activa: false },
  { nombre: "Castelar", lat: -34.6510, lng: -58.6440, partido: "Morón", activa: false },
  { nombre: "Escobar", lat: -34.3480, lng: -58.7920, partido: "Escobar", activa: false },
  { nombre: "Ezeiza", lat: -34.8280, lng: -58.5320, partido: "Ezeiza", activa: false },
  { nombre: "Florencio Varela", lat: -34.8180, lng: -58.2760, partido: "Florencio Varela", activa: false },
  { nombre: "Haedo", lat: -34.6400, lng: -58.5920, partido: "Morón", activa: false },
  { nombre: "Hurlingham", lat: -34.5900, lng: -58.6370, partido: "Hurlingham", activa: false },
  { nombre: "Ituzaingó", lat: -34.6600, lng: -58.6700, partido: "Ituzaingó", activa: false },
  { nombre: "José C. Paz", lat: -34.5140, lng: -58.7530, partido: "José C. Paz", activa: false },
  { nombre: "Lanús", lat: -34.7060, lng: -58.3940, partido: "Lanús", activa: false },
  { nombre: "Lomas de Zamora", lat: -34.7610, lng: -58.4060, partido: "Lomas de Zamora", activa: false },
  { nombre: "Malvinas Argentinas", lat: -34.4900, lng: -58.7100, partido: "Malvinas Argentinas", activa: false },
  { nombre: "Merlo", lat: -34.6650, lng: -58.7280, partido: "Merlo", activa: false },
  { nombre: "Monte Grande", lat: -34.8180, lng: -58.4620, partido: "Esteban Echeverría", activa: false },
  { nombre: "Moreno", lat: -34.6350, lng: -58.7900, partido: "Moreno", activa: false },
  { nombre: "Morón", lat: -34.6530, lng: -58.6200, partido: "Morón", activa: false },
  { nombre: "Nordelta", lat: -34.4020, lng: -58.6570, partido: "Tigre", activa: false },
  { nombre: "Pilar", lat: -34.4590, lng: -58.9140, partido: "Pilar", activa: false },
  { nombre: "Quilmes", lat: -34.7200, lng: -58.2680, partido: "Quilmes", activa: false },
  { nombre: "Ramos Mejía", lat: -34.6470, lng: -58.5630, partido: "La Matanza", activa: false },
  { nombre: "San Fernando", lat: -34.4420, lng: -58.5590, partido: "San Fernando", activa: false },
  { nombre: "San Justo", lat: -34.6820, lng: -58.5580, partido: "La Matanza", activa: false },
  { nombre: "San Miguel", lat: -34.5420, lng: -58.7120, partido: "San Miguel", activa: false },
  { nombre: "Tigre", lat: -34.4260, lng: -58.5800, partido: "Tigre", activa: false },
  { nombre: "Tres de Febrero", lat: -34.6070, lng: -58.5620, partido: "Tres de Febrero", activa: false },
  { nombre: "Wilde", lat: -34.7050, lng: -58.3300, partido: "Avellaneda", activa: false },
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
 * centroide de una localidad elegida (ver BarrioSelect + set-zone), así que
 * encontrar la localidad más cercana a esas coordenadas no es una
 * adivinanza — recupera exactamente lo que se declaró. Busca en TODO el
 * catálogo, no solo en las activas: una zona ya guardada puede apuntar a
 * una localidad que después se desactivó, y seguimos queriendo mostrar su
 * nombre real.
 */
export function findNearestBarrio(lat: number, lng: number): Barrio {
  return BARRIOS.reduce((closest, b) =>
    haversineKm(lat, lng, b.lat, b.lng) < haversineKm(lat, lng, closest.lat, closest.lng) ? b : closest
  );
}
