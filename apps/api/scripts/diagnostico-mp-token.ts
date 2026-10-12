/**
 * Diagnostico puntual — medir si los mpAccessToken de MercadoPago que ya
 * estan guardados en produccion todavia sirven.
 *
 * Contexto completo: docs/guau-pendientes.md, item "refresh_token de
 * MercadoPago no se guarda en ningun lado". Resumen: WalkerProfile solo
 * tiene mpAccessToken y mpUserId (prisma/schema.prisma) — no hay columna
 * para refresh_token ni para una fecha de vencimiento. La documentacion de
 * MercadoPago dice que el access_token dura 180 dias. Si vence, hoy no hay
 * nada que lo detecte: mpConnected se deriva como `!!mpAccessToken`
 * (walkers.service.ts), o sea "la columna no esta vacia", no "el token
 * todavia sirve". Antes de diseñar una renovacion hace falta saber si el
 * problema ya esta pasando.
 *
 * Este script NO arregla nada y NO escribe en la base. Es puramente de
 * lectura: trae los mpAccessToken guardados, los desencripta con la MISMA
 * logica que usa la app (CryptoService — se instancia la clase real, no se
 * reimplementa el algoritmo aparte, para no terminar midiendo contra una
 * logica de desencriptado distinta de la que usa produccion) y le pregunta
 * a MercadoPago si cada uno todavia es valido contra GET /users/me, el
 * endpoint mas liviano que existe para eso (no toca pagos ni paseos).
 *
 * decrypt() ya distingue dos casos y ambos devuelven "" (crypto.service.ts):
 * un token legacy sin formato de cifrado (warn, no se reporta a Sentry) y
 * un token cifrado con una clave que no corresponde — ENCRYPTION_KEY
 * rotada, o dato de otro ambiente (error, SI se reporta a Sentry). Los dos
 * logs del servicio van a aparecer en esta misma corrida porque
 * CryptoService los emite el solo. Lo que este script agrega es su PROPIO
 * veredicto por fila, y ese veredicto trata "no se pudo desencriptar" como
 * un estado distinto de "el token no sirve": si no hay texto plano no hay
 * nada que mandarle a MercadoPago, y confundir los dos esconderia cuantos
 * tokens son de verdad candidatos a haber vencido.
 *
 * Veredicto por fila:
 *   - NO_DESENCRIPTA → decrypt() devolvio "". No se intento la llamada a MP.
 *   - VIVO           → GET /users/me respondio 200.
 *   - MUERTO         → GET /users/me respondio otro status (401 esperado
 *                       para un token vencido o revocado).
 *   - SIN_CONEXION   → la llamada a MP ni devolvio respuesta (timeout o
 *                       error de red). No es un veredicto sobre el token:
 *                       es "no se pudo medir", y se distingue a proposito
 *                       de MUERTO para no contar una falla de red como un
 *                       token vencido.
 *
 * Regla que no se negocia: el token NUNCA se imprime, ni completo ni
 * parcial. La salida de este script se va a pegar en una conversacion y el
 * repo es publico — un solo console.log de mas filtraria una credencial
 * viva de un paseador real. Por eso el token desencriptado vive en una
 * variable que solo se usa para el header Authorization del fetch y nunca
 * se vuelve a tocar.
 *
 * Uso (desde apps/api, con DATABASE_URL y ENCRYPTION_KEY del ambiente
 * correcto — produccion, en este caso, porque es ahi donde esta la
 * paseadora real):
 *   npx ts-node scripts/diagnostico-mp-token.ts
 *
 * NO se corrio contra ninguna base como parte de este cambio — lo corre Joa
 * a mano, a proposito, contra produccion.
 */
import { PrismaClient } from "@prisma/client";
import { CryptoService } from "../src/common/crypto/crypto.service";

const prisma = new PrismaClient();

// Mismo motivo que describeDatabaseTarget() en set-admin-role.ts: este
// proyecto ya tuvo mas de una vez una terminal con el .env de un ambiente
// pegandole a otro sin que la salida del script se viera distinta. Este
// script llama a la API real de MercadoPago con tokens reales — vale la
// pena saber de un vistazo contra que base se esta leyendo antes de leer
// una sola fila de la tabla.
function describeDatabaseTarget(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    return "NO SE PUDO DETERMINAR (falta DATABASE_URL) — mira dos veces antes de interpretar la salida";
  }
  try {
    const parsed = new URL(url);
    const host = parsed.hostname;
    const dbName = parsed.pathname.replace(/^\//, "");
    if (!host || !dbName) throw new Error("host o nombre de base vacios");
    return `${host}/${dbName}`;
  } catch {
    return "NO SE PUDO DETERMINAR (DATABASE_URL con formato inesperado) — mira dos veces antes de interpretar la salida";
  }
}

type Veredicto = "VIVO" | "MUERTO" | "NO_DESENCRIPTA" | "SIN_CONEXION";

interface Fila {
  userId: string;
  mpUserId: string;
  updatedAtAprox: string;
  statusHttp: string;
  veredicto: Veredicto;
}

const MP_TIMEOUT_MS = 10_000;

// GET /users/me con el token del paseador — el endpoint mas liviano que
// expone MercadoPago para validar un access_token, no toca pagos ni
// paseos. Devuelve solo el status HTTP: el body de la respuesta no
// interesa para este diagnostico y evita manipular datos de la cuenta de
// MercadoPago de un paseador real mas de lo necesario.
async function checkToken(token: string): Promise<{ statusHttp: string; veredicto: "VIVO" | "MUERTO" | "SIN_CONEXION" }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), MP_TIMEOUT_MS);
  try {
    const response = await fetch("https://api.mercadopago.com/users/me", {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });
    return {
      statusHttp: String(response.status),
      veredicto: response.ok ? "VIVO" : "MUERTO",
    };
  } catch {
    // Timeout o error de red — no es un veredicto sobre el token, es que no
    // se pudo medir. No se loguea el error completo: en teoria un fetch que
    // fallo por la red no deberia tener el token en ningun lado del error,
    // pero no vale la pena arriesgarlo con la unica regla que este script
    // no puede romper.
    return { statusHttp: "SIN_RESPUESTA", veredicto: "SIN_CONEXION" };
  } finally {
    clearTimeout(timeout);
  }
}

async function main() {
  console.log(`Base: ${describeDatabaseTarget()}`);

  const cryptoService = new CryptoService();

  const walkers = await prisma.walkerProfile.findMany({
    where: { mpAccessToken: { not: null } },
    select: {
      userId: true,
      mpUserId: true,
      mpAccessToken: true,
      user: { select: { updatedAt: true } },
    },
  });

  console.log(`Paseadores con mpAccessToken guardado: ${walkers.length}`);
  if (walkers.length === 0) {
    console.log("Nada para medir.");
    return;
  }

  const filas: Fila[] = [];

  // Secuencial, no Promise.all: esto llama a la API real de MercadoPago con
  // tokens de paseadores reales — un for a proposito, mismo criterio que
  // backfill-pickup-codes.ts, para no mandar N requests simultaneas a un
  // tercero por un script de diagnostico.
  for (const walker of walkers) {
    // WalkerProfile no tiene su propia columna updatedAt (prisma/schema.prisma)
    // — la unica fecha disponible es la del User, que cambia con CUALQUIER
    // edicion de ese usuario, no solo con la conexion de MercadoPago. Es una
    // pista, mas lejana todavia de lo que pedia el diagnostico original, no
    // un dato: se etiqueta explicito como tal en vez de nombrarla como si
    // fuera la fecha de conexion.
    const updatedAtAprox = `${walker.user.updatedAt.toISOString()} (de User, no de WalkerProfile — ver comentario)`;

    if (!walker.mpAccessToken) continue; // ya filtrado por el where, defensivo

    const token = cryptoService.decrypt(walker.mpAccessToken);

    if (!token) {
      filas.push({
        userId: walker.userId,
        mpUserId: walker.mpUserId ?? "(sin mpUserId)",
        updatedAtAprox,
        statusHttp: "N/A (no se intento — ver veredicto)",
        veredicto: "NO_DESENCRIPTA",
      });
      continue;
    }

    const { statusHttp, veredicto } = await checkToken(token);
    // `token` no se vuelve a usar despues de esta linea.

    filas.push({
      userId: walker.userId,
      mpUserId: walker.mpUserId ?? "(sin mpUserId)",
      updatedAtAprox,
      statusHttp,
      veredicto,
    });
  }

  console.table(filas);

  const resumen = filas.reduce<Record<Veredicto, number>>(
    (acc, fila) => {
      acc[fila.veredicto]++;
      return acc;
    },
    { VIVO: 0, MUERTO: 0, NO_DESENCRIPTA: 0, SIN_CONEXION: 0 },
  );
  console.log(
    `Resumen — VIVO: ${resumen.VIVO}, MUERTO: ${resumen.MUERTO}, ` +
    `NO_DESENCRIPTA: ${resumen.NO_DESENCRIPTA}, SIN_CONEXION: ${resumen.SIN_CONEXION}`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1); // exit != 0 para que un fallo sea visible, no silencioso
  })
  .finally(() => prisma.$disconnect());
