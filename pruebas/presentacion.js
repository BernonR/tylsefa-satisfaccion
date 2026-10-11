// Corre las pruebas despacio y con el navegador visible, para presentarlas.
//   npm run presentacion                     -> todas las pruebas
//   npm run presentacion -- -g "CP-M01-03"   -> solo las que tengan ese código
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const cli = [
  path.join(__dirname, '..', 'node_modules', '@playwright', 'test', 'cli.js'),
  path.join(__dirname, '..', 'node_modules', 'playwright', 'cli.js'),
  ...(process.env.PLAYWRIGHT_CLI ? [process.env.PLAYWRIGHT_CLI] : []),
].find((ruta) => fs.existsSync(ruta));
if (!cli) {
  console.error('No se encontró Playwright. Corra primero: npm run preparar');
  process.exit(1);
}

const argumentos = [cli, 'test', '--headed', '--workers=1', ...process.argv.slice(2)];
const resultado = spawnSync(process.execPath, argumentos, {
  stdio: 'inherit',
  env: { ...process.env, PRESENTACION: '1' },
});
process.exit(resultado.status ?? 1);
