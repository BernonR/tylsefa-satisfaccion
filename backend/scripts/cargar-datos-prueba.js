'use strict';

// Carga el personal y las empresas cliente de prueba (datos modificados entregados por Tylsefa).
// Se puede correr varias veces: actualiza a quien ya existe y no duplica nada.
//
//   npm run cargar-datos-prueba               -> base de desarrollo (DATABASE_URL de backend/.env)
//   npm run cargar-datos-prueba:produccion    -> base de producción (DATABASE_URL_PRODUCCION de backend/.env)
//
// Todo el personal recibe la misma contraseña temporal, que se escribe aquí y no se guarda en ningún archivo.

const path = require('node:path');
const readline = require('node:readline');

try { process.loadEnvFile(path.join(__dirname, '..', '.env')); } catch { /* sin .env */ }

const produccion = process.argv.includes('--produccion');
if (produccion) {
  if (!process.env.DATABASE_URL_PRODUCCION) {
    console.error('Falta DATABASE_URL_PRODUCCION en backend/.env');
    process.exit(1);
  }
  process.env.DATABASE_URL = process.env.DATABASE_URL_PRODUCCION;
}
process.env.SESION_SECRETO ||= 'no-se-usa-en-este-script';

const { consulta, pool } = require('../src/bd');
const { generarResumen, revisarPolitica } = require('../src/seguridad/contrasenas');

const carpeta = path.join(__dirname, '..', '..', 'base-de-datos', 'datos-prueba');
const { personal } = require(path.join(carpeta, 'personal.json'));
const { clientes } = require(path.join(carpeta, 'clientes.json'));

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const preguntar = (texto) => new Promise((ok) => rl.question(texto, ok));
function preguntarOculto(texto) {
  return new Promise((ok) => {
    const escribir = rl._writeToOutput;
    rl._writeToOutput = (cadena) => { if (cadena.includes(texto)) escribir.call(rl, cadena); else escribir.call(rl, '*'); };
    rl.question(texto, (respuesta) => { rl._writeToOutput = escribir; process.stdout.write('\n'); ok(respuesta); });
  });
}

async function cargarPersonal(resumen) {
  const { rows: [sucursal] } = await consulta('SELECT id_sucursal FROM sucursal ORDER BY id_sucursal LIMIT 1');
  const ids = {};
  // Primero gerente y supervisores, para que los vendedores puedan apuntar a su supervisor.
  const ordenados = [...personal].sort((a, b) => Number(Boolean(a.supervisor)) - Number(Boolean(b.supervisor)));
  for (const p of ordenados) {
    const idSupervisor = p.supervisor ? ids[p.supervisor] : null;
    // Si la persona ya se había cargado con otro correo, se le actualiza en lugar de duplicarla.
    if (p.correos_anteriores?.length) {
      await consulta(
        `UPDATE usuario SET correo = $1
          WHERE lower(correo) = ANY($2::text[])
            AND NOT EXISTS (SELECT 1 FROM usuario WHERE lower(correo) = lower($1))`,
        [p.correo.toLowerCase(), p.correos_anteriores.map((c) => c.toLowerCase())],
      );
    }
    if (p.supervisor && !idSupervisor) throw new Error(`No se encontró el supervisor "${p.supervisor}" de ${p.nombres}.`);
    const { rows: [fila] } = await consulta(
      `INSERT INTO usuario (nombres, apellidos, correo, hash_contrasena, id_perfil, id_supervisor, id_sucursal)
       VALUES ($1, $2, $3, $4, (SELECT id_perfil FROM perfil WHERE nombre = $5), $6, $7)
       ON CONFLICT (correo) DO UPDATE SET nombres = EXCLUDED.nombres, apellidos = EXCLUDED.apellidos,
         hash_contrasena = EXCLUDED.hash_contrasena, id_perfil = EXCLUDED.id_perfil,
         id_supervisor = EXCLUDED.id_supervisor, activo = true
       RETURNING id_usuario`,
      [p.nombres, p.apellidos, p.correo.toLowerCase(), resumen, p.perfil, idSupervisor, sucursal.id_sucursal],
    );
    ids[p.clave] = fila.id_usuario;
    console.log(`  ✓ ${p.perfil.padEnd(11)} ${p.nombres} ${p.apellidos}  <${p.correo}>`);
  }
}

async function cargarClientes() {
  let nuevos = 0;
  for (const c of clientes) {
    const { rows } = await consulta(
      `INSERT INTO empresa_cliente (codigo, nombre, nit, segmento, correo_empresarial, contacto)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (codigo) DO NOTHING
       RETURNING id_cliente`,
      [c.codigo, c.nombre, c.nit, c.segmento, c.correo, c.contacto],
    );
    nuevos += rows.length;
  }
  console.log(`  ✓ ${nuevos} empresas cliente nuevas (${clientes.length - nuevos} ya existían)`);
}

(async () => {
  console.log(`\nCarga de datos de prueba · base de ${produccion ? 'PRODUCCIÓN' : 'desarrollo'}`);
  console.log(`Personal: ${personal.length} · Empresas cliente: ${clientes.length}\n`);
  if ((await preguntar('¿Continuar? (s/n): ')).trim().toLowerCase() !== 's') { console.log('Sin cambios.'); return; }

  const clave = await preguntarOculto('Contraseña temporal para todo el personal: ');
  const faltas = revisarPolitica(clave);
  if (faltas.length) throw new Error(`La contraseña necesita ${faltas.join(', ')}.`);
  if ((await preguntarOculto('Repita la contraseña: ')) !== clave) throw new Error('Las contraseñas no coinciden.');

  console.log('\nPersonal:');
  await cargarPersonal(await generarResumen(clave));
  console.log('\nEmpresas cliente:');
  await cargarClientes();
  await consulta(
    "INSERT INTO bitacora_auditoria (accion, entidad, detalle) VALUES ('carga_datos_prueba', 'sistema', $1)",
    [`${personal.length} usuarios y ${clientes.length} empresas cliente desde la consola`],
  );
  console.log('\nListo. El personal ya puede iniciar sesión con la contraseña temporal.');
})()
  .catch((error) => { console.error(`\nNo se completó: ${error.message}`); process.exitCode = 1; })
  .finally(async () => { rl.close(); await pool?.end(); });
