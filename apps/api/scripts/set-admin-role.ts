/**
 * Alta y baja de ADMIN — la unica forma decidida de crear un admin en Guau.
 * Decision completa, con el porque de cada punto, en
 * docs/guau-red-y-seguridad.md §4 ("Como se crea un ADMIN").
 *
 * Antes de este script, la unica via para que un usuario tuviera
 * role = ADMIN era un UPDATE a mano contra la base: no hay endpoint, no hay
 * DTO de registro, no hay @default en User.role, y prisma/seed.ts solo hace
 * upsert de los WalkType. Ese vacio es a proposito (nunca un endpoint HTTP:
 * el privilegio maximo no puede viajar por la red), pero dejaba la
 * operacion sin rastro, sin repetibilidad y sin ningun chequeo — se hacia
 * de apuro. Este script es esa misma operacion, prolija y auditable.
 *
 * No es un endpoint: no lo expone Nest, no tiene guard propio, no lo llama
 * el front. Se corre a mano, desde una terminal con acceso a DATABASE_URL
 * del ambiente correcto.
 *
 * NO crea usuarios ni toca contrasenas: promueve/degrada a alguien que ya
 * se registro por el flujo normal (dueno o paseador). Si el mail no existe
 * en la base, el script lo dice y no hace nada — el alta de la CUENTA sigue
 * siendo el registro normal, esto solo cambia el ROL de una que ya existe.
 *
 * Uso (desde apps/api):
 *   npm run promote-admin -- --email=<mail> [--yes]
 *   npm run demote-admin  -- --email=<mail> --to=<OWNER|WALKER> [--yes]
 *
 * El mail va SIEMPRE como argumento, nunca hardcodeado: el repo es publico
 * y no puede anunciar cual es la cuenta de admin, y cambiar quien lo es no
 * puede requerir un deploy.
 *
 * Por que --to es obligatorio en la baja, y no un default: la promocion
 * pisa el rol anterior (OWNER o WALKER) con ADMIN sin guardarlo en ningun
 * lado — no existe un "rol antes de ser admin" que este script pueda leer
 * para restaurarlo solo. Adivinar seria exactamente el tipo de suposicion
 * silenciosa que este proyecto evita (CLAUDE.md, regla 4: verificar, no
 * suponer). Quien da de baja a un admin tiene que decir a que vuelve.
 *
 * Confirmacion: por default el script pide escribir "si" antes de escribir
 * en la base. --yes la salta, para uso en un pipe o un script mas grande —
 * pero nunca es el default: dar o sacar el privilegio maximo no puede pasar
 * por un tipeo apurado.
 *
 * Primera linea de la salida, siempre: "Base: <host>/<nombre>" — contra que
 * base va a escribir. DATABASE_URL sale del entorno de la terminal, no de
 * un argumento del script, asi que una terminal con el .env de otro
 * ambiente cargado pega ahi sin ningun aviso distinto — ver
 * describeDatabaseTarget().
 */
import * as readline from "readline/promises";
import { PrismaClient, UserRole } from "@prisma/client";

const prisma = new PrismaClient();

function parseArgs(argv: string[]) {
  const args: Record<string, string | boolean> = {};
  for (const raw of argv) {
    if (!raw.startsWith("--")) continue;
    const eq = raw.indexOf("=");
    if (eq === -1) {
      args[raw.slice(2)] = true;
    } else {
      args[raw.slice(2, eq)] = raw.slice(eq + 1);
    }
  }
  return args;
}

// Contra que base va a escribir — impreso siempre, ANTES de cualquier otra
// cosa (incluidos los caminos idempotentes, que son justo los que se leen
// por arriba). Este proyecto ya tuvo tres veces una variable de un ambiente
// apuntando al otro (API_URL 2026-07-07, FRONTEND_URL 2026-08-04, API_URL
// 2026-08-25) — DATABASE_URL sale del entorno de la terminal, no de un
// argumento, asi que una terminal con el .env de produccion cargado le
// pegaria a produccion sin que la salida del script se vea distinta.
//
// Nunca la connection string completa ni la password — solo host y nombre
// de base, lo minimo que hace falta para reconocer el ambiente de un
// vistazo. Si el parseo falla, no se inventa un fallback silencioso: se
// avisa que no se pudo determinar, porque eso mismo es motivo para mirar
// dos veces antes de confirmar.
function describeDatabaseTarget(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    return "NO SE PUDO DETERMINAR (falta DATABASE_URL) — mira dos veces antes de confirmar";
  }
  try {
    const parsed = new URL(url);
    const host = parsed.hostname;
    const dbName = parsed.pathname.replace(/^\//, "");
    if (!host || !dbName) throw new Error("host o nombre de base vacios");
    return `${host}/${dbName}`;
  } catch {
    return "NO SE PUDO DETERMINAR (DATABASE_URL con formato inesperado) — mira dos veces antes de confirmar";
  }
}

async function confirm(question: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question(`${question} (escribi "si" para confirmar): `);
    const normalized = answer.trim().toLowerCase().replace("í", "i");
    return normalized === "si";
  } finally {
    rl.close();
  }
}

async function main() {
  // Primera linea, siempre, pase lo que pase despues — ver el comentario
  // de describeDatabaseTarget().
  console.log(`Base: ${describeDatabaseTarget()}`);

  const args = parseArgs(process.argv.slice(2));
  const email = typeof args.email === "string" ? args.email.trim() : "";
  const demote = args.demote === true;
  const skipConfirm = args.yes === true;
  const to = typeof args.to === "string" ? args.to.toUpperCase() : "";

  if (!email) {
    console.error('Falta --email=<mail>. Uso: npm run promote-admin -- --email=<mail>');
    process.exit(1);
  }

  if (demote) {
    if (to !== UserRole.OWNER && to !== UserRole.WALKER) {
      console.error(
        'Falta --to=OWNER o --to=WALKER. La baja no adivina a que rol vuelve el usuario ' +
        '(no hay registro del rol que tenia antes de ser ADMIN) — hay que decirlo explicito.',
      );
      process.exit(1);
    }
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, role: true },
  });

  if (!user) {
    console.error(
      `No existe ningun usuario con el mail "${email}". Este script no crea cuentas: ` +
      "primero tiene que registrarse normalmente en la app (como dueño o como paseador), y recien " +
      "despues se lo puede promover.",
    );
    process.exit(1);
  }

  if (!demote) {
    // ─── Promover a ADMIN ────────────────────────────────────
    if (user.role === UserRole.ADMIN) {
      console.log(`${user.email} (${user.id}) ya es ADMIN. Nada para hacer.`);
      return;
    }

    console.log(`Usuario encontrado: ${user.email} (${user.id}), rol actual: ${user.role}.`);
    console.log(`Se lo va a promover a ADMIN.`);

    if (!skipConfirm && !(await confirm("Confirmar la promocion"))) {
      console.log("Cancelado. No se escribio nada.");
      return;
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { role: UserRole.ADMIN },
      select: { id: true, email: true, role: true },
    });

    console.log(
      `OK — ${updated.email} (${updated.id}): ${user.role} -> ${updated.role}.`,
    );
    return;
  }

  // ─── Sacar ADMIN ──────────────────────────────────────────
  if (user.role !== UserRole.ADMIN) {
    console.log(`${user.email} (${user.id}) no es ADMIN (rol actual: ${user.role}). Nada para hacer.`);
    return;
  }

  console.log(`Usuario encontrado: ${user.email} (${user.id}), rol actual: ADMIN.`);
  console.log(`Se le va a sacar el rol de ADMIN y va a quedar como ${to}.`);

  if (!skipConfirm && !(await confirm("Confirmar la baja"))) {
    console.log("Cancelado. No se escribio nada.");
    return;
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { role: to as UserRole },
    select: { id: true, email: true, role: true },
  });

  console.log(
    `OK — ${updated.email} (${updated.id}): ADMIN -> ${updated.role}.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1); // exit != 0 para que un fallo sea visible, no silencioso
  })
  .finally(() => prisma.$disconnect());
