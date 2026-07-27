/**
 * Lista estática de barrios (CABA) y localidades (GBA) con un centroide
 * aproximado cada uno, para alimentar el selector de zona en /paseadores y
 * en la reserva de un paseo.
 *
 * Esto es PROVISIONAL hasta integrar geocodificación real con Mapbox (ya es
 * dependencia del proyecto — mapbox-gl / @mapbox/mapbox-gl-geocoder están
 * instalados sin usar, a la espera de esa feature). Geocodificar la
 * dirección que escribe el dueño es un problema distinto del tracking GPS en
 * vivo del paseo: acá alcanza con un punto aproximado por barrio porque el
 * radio de cobertura del paseador se mide en kilómetros, no en metros.
 */

export type Barrio = {
  nombre: string;
  lat: number;
  lng: number;
  zona: "CABA" | "GBA";
};

export const BARRIOS: Barrio[] = [
  // ─── CABA (48 barrios oficiales) ─────────────────────────────────────────
  { nombre: "Agronomía", lat: -34.5930, lng: -58.4880, zona: "CABA" },
  { nombre: "Almagro", lat: -34.6100, lng: -58.4200, zona: "CABA" },
  { nombre: "Balvanera", lat: -34.6090, lng: -58.4010, zona: "CABA" },
  { nombre: "Barracas", lat: -34.6430, lng: -58.3830, zona: "CABA" },
  { nombre: "Belgrano", lat: -34.5620, lng: -58.4560, zona: "CABA" },
  { nombre: "Boedo", lat: -34.6280, lng: -58.4180, zona: "CABA" },
  { nombre: "Caballito", lat: -34.6190, lng: -58.4370, zona: "CABA" },
  { nombre: "Chacarita", lat: -34.5880, lng: -58.4540, zona: "CABA" },
  { nombre: "Coghlan", lat: -34.5620, lng: -58.4740, zona: "CABA" },
  { nombre: "Colegiales", lat: -34.5750, lng: -58.4500, zona: "CABA" },
  { nombre: "Constitución", lat: -34.6270, lng: -58.3810, zona: "CABA" },
  { nombre: "Flores", lat: -34.6280, lng: -58.4640, zona: "CABA" },
  { nombre: "Floresta", lat: -34.6300, lng: -58.4820, zona: "CABA" },
  { nombre: "La Boca", lat: -34.6345, lng: -58.3630, zona: "CABA" },
  { nombre: "La Paternal", lat: -34.5950, lng: -58.4650, zona: "CABA" },
  { nombre: "Liniers", lat: -34.6420, lng: -58.5230, zona: "CABA" },
  { nombre: "Mataderos", lat: -34.6580, lng: -58.5030, zona: "CABA" },
  { nombre: "Monserrat", lat: -34.6110, lng: -58.3830, zona: "CABA" },
  { nombre: "Monte Castro", lat: -34.6180, lng: -58.5030, zona: "CABA" },
  { nombre: "Nueva Pompeya", lat: -34.6470, lng: -58.4180, zona: "CABA" },
  { nombre: "Núñez", lat: -34.5450, lng: -58.4620, zona: "CABA" },
  { nombre: "Palermo", lat: -34.5889, lng: -58.4300, zona: "CABA" },
  { nombre: "Parque Avellaneda", lat: -34.6380, lng: -58.4750, zona: "CABA" },
  { nombre: "Parque Chacabuco", lat: -34.6350, lng: -58.4390, zona: "CABA" },
  { nombre: "Parque Chas", lat: -34.5860, lng: -58.4720, zona: "CABA" },
  { nombre: "Parque Patricios", lat: -34.6360, lng: -58.4020, zona: "CABA" },
  { nombre: "Puerto Madero", lat: -34.6083, lng: -58.3630, zona: "CABA" },
  { nombre: "Recoleta", lat: -34.5875, lng: -58.3974, zona: "CABA" },
  { nombre: "Retiro", lat: -34.5920, lng: -58.3750, zona: "CABA" },
  { nombre: "Saavedra", lat: -34.5580, lng: -58.4830, zona: "CABA" },
  { nombre: "San Cristóbal", lat: -34.6220, lng: -58.4040, zona: "CABA" },
  { nombre: "San Nicolás", lat: -34.6030, lng: -58.3780, zona: "CABA" },
  { nombre: "San Telmo", lat: -34.6210, lng: -58.3720, zona: "CABA" },
  { nombre: "Vélez Sarsfield", lat: -34.6320, lng: -58.4900, zona: "CABA" },
  { nombre: "Versalles", lat: -34.6270, lng: -58.5170, zona: "CABA" },
  { nombre: "Villa Crespo", lat: -34.5990, lng: -58.4380, zona: "CABA" },
  { nombre: "Villa del Parque", lat: -34.6020, lng: -58.4900, zona: "CABA" },
  { nombre: "Villa Devoto", lat: -34.6010, lng: -58.5150, zona: "CABA" },
  { nombre: "Villa General Mitre", lat: -34.6050, lng: -58.4780, zona: "CABA" },
  { nombre: "Villa Lugano", lat: -34.6780, lng: -58.4700, zona: "CABA" },
  { nombre: "Villa Luro", lat: -34.6390, lng: -58.5020, zona: "CABA" },
  { nombre: "Villa Ortúzar", lat: -34.5820, lng: -58.4650, zona: "CABA" },
  { nombre: "Villa Pueyrredón", lat: -34.5820, lng: -58.5040, zona: "CABA" },
  { nombre: "Villa Real", lat: -34.6210, lng: -58.5280, zona: "CABA" },
  { nombre: "Villa Riachuelo", lat: -34.6800, lng: -58.4620, zona: "CABA" },
  { nombre: "Villa Santa Rita", lat: -34.6180, lng: -58.4750, zona: "CABA" },
  { nombre: "Villa Soldati", lat: -34.6650, lng: -58.4380, zona: "CABA" },
  { nombre: "Villa Urquiza", lat: -34.5720, lng: -58.4900, zona: "CABA" },

  // ─── GBA (localidades más pobladas, zona norte/oeste/sur) ────────────────
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
