import 'dotenv/config';

/**
 * Punto de entrada del seed.
 *
 * - `demo` (por defecto): padrón realista del Club Sportivo Unión de Ordóñez.
 *   Lo usan el desarrollo, Docker y los entornos de test y main.
 * - `base`: el padrón chico histórico. Lo usan los E2E, que dependen de
 *   personas, tarifas y reservas concretas (RES-SEED*, Valeria, Natación).
 *
 *   SEED_PERFIL=base npm run prisma:seed
 */
const perfil = (process.env.SEED_PERFIL ?? 'demo').toLowerCase();

/**
 * Compilado (`node prisma/seed.js`) carga el JS. Con ts-node hay que pedir el
 * `.ts`: si no, Node agarra el `.js` compilado y corre una versión vieja.
 */
async function cargar(modulo: 'seed.demo' | 'seed.base') {
  if (__filename.endsWith('.js')) {
    await import(`./${modulo}.js`);
    return;
  }
  await import(`./${modulo}.ts`);
}

async function main() {
  if (perfil === 'base') {
    await cargar('seed.base');
    return;
  }
  if (perfil === 'demo') {
    await cargar('seed.demo');
    return;
  }
  console.error(`SEED_PERFIL="${perfil}" no es válido. Usá "demo" (por defecto) o "base".`);
  process.exit(1);
}

void main();
