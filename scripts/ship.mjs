import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const gh = (process.platform === 'win32' && existsSync('C:\\Program Files\\GitHub CLI\\gh.exe'))
  ? '"C:\\Program Files\\GitHub CLI\\gh.exe"'
  : 'gh';

function run(cmd, inherit = true) {
  console.log(`\x1b[36m> ${cmd}\x1b[0m`);
  try {
    return execSync(cmd, { stdio: inherit ? 'inherit' : 'pipe', encoding: 'utf-8' });
  } catch (error) {
    if (!inherit) return null;
    process.exit(1);
  }
}

function sleep(ms) {
  execSync(`node -e "setTimeout(() => {}, ${ms})"`);
}

// 1. Validar rama actual
const branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8' }).trim();
if (['main', 'dev', 'test'].includes(branch)) {
  console.error(`\x1b[31m[ERROR] No podés ejecutar ship directamente desde la rama '${branch}'. Creá una rama feature/ o fix/.\x1b[0m`);
  process.exit(1);
}

console.log(`\x1b[32m=== Automatización SocialClub: Ship de la rama '${branch}' ===\x1b[0m\n`);

// 2. Pushear rama actual al remoto
console.log('1. Pusheando cambios a origin...');
run(`git push -u origin ${branch}`);

// 3. Crear PR si no existe
console.log('\n2. Verificando Pull Request hacia dev...');
const prInfo = run(`${gh} pr view --json url,number`, false);
if (!prInfo) {
  console.log('Creando Pull Request automáticamente con la información del commit...');
  run(`${gh} pr create --base dev --fill`);
} else {
  try {
    const { number, url } = JSON.parse(prInfo);
    console.log(`PR #${number} detectada: ${url}`);
  } catch {
    console.log('PR detectada.');
  }
}

// 4. Esperar a que inicien los checks y monitorear hasta que pasen
console.log('\n3. Esperando que inicien los checks de CI en GitHub...');
for (let i = 0; i < 15; i++) {
  const checks = run(`${gh} pr checks`, false);
  if (checks && !checks.includes('no checks reported')) {
    break;
  }
  sleep(3000);
}

console.log('Monitoreando ejecución de tests en vivo...');
run(`${gh} pr checks --watch`);

// 5. Mergear PR a dev
console.log('\n4. CI en verde! Mergeando PR hacia dev...');
run(`${gh} pr merge --merge`);

// 6. Volver a dev y sincronizar
console.log('\n5. Sincronizando entorno local con dev...');
run('git checkout dev');
run('git pull origin dev');

console.log(`\n\x1b[32m[ÉXITO] Rama '${branch}' testeada, mergeada y dev actualizado con éxito!\x1b[0m\n`);
