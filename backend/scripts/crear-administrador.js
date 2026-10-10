'use strict';

// Crea la cuenta del administrador del sistema, o le cambia la contraseña si ya existe.
// La contraseña se escribe aquí, en su computadora, y solo se guarda su resumen.
//
//   npm run crear-admin               -> base de desarrollo (DATABASE_URL de backend/.env)
//   npm run crear-admin:produccion    -> base de producción (DATABASE_URL_PRODUCCION de backend/.env)

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

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const preguntar = (texto) => new Promise((ok) => rl.question(texto, ok));

function preguntarOculto(texto) {
  return new Promise((ok) => {
    const escribir = rl._writeToOutput;
    rl._writeToOutput = (cadena) => { if (cadena.includes(texto)) escribir.call(rl, cadena); else escribir.call(rl, '*'); };
    rl.question(texto, (respuesta) => { rl._writeToOutput = escribir; process.stdout.write('\n'); ok(respuesta); });
  });
}

(async () => {
  console.log(`\nCuenta de administrador · base de ${produccion ? 'PRODUCCIÓN' : 'desarrollo'}\n`);
  const correo = (await preguntar('Correo: ')).trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) throw new Error('El correo no es válido.');

  const { rows: existentes } = await consulta('SELECT id_usuario, nombres FROM usuario WHERE lower(correo) = $1', [correo]);
  let nombres; let apellidos;
  if (existentes.length) {
    const r = (await preguntar(`Ya existe una cuenta para ${existentes[0].nombres}. ¿Cambiar su contraseña? (s/n): `)).trim().toLowerCase();
    if (r !== 's') { console.log('Sin cambios.'); return; }
  } else {
    nombres = (await preguntar('Nombres: ')).trim();
    apellidos = (await preguntar('Apellidos: ')).trim();
    if (!nombres || !apellidos) throw new Error('Nombres y apellidos son obligatorios.');
  }

  const clave = await preguntarOculto('Contraseña: ');
  const faltas = revisarPolitica(clave);
  if (faltas.length) throw new Error(`La contraseña necesita ${faltas.join(', ')}.`);
  if ((await preguntarOculto('Repita la contraseña: ')) !== clave) throw new Error('Las contraseñas no coinciden.');

  const resumen = await generarResumen(clave);
  if (existentes.length) {
    await consulta('UPDATE usuario SET hash_contrasena = $1, activo = true WHERE id_usuario = $2', [resumen, existentes[0].id_usuario]);
    await consulta("INSERT INTO bitacora_auditoria (accion, entidad, id_registro_afectado, detalle) VALUES ('cambio_contrasena', 'usuario', $1, 'Desde la consola de administración')", [existentes[0].id_usuario]);
    console.log('\nContraseña actualizada.');
  } else {
    const { rows } = await consulta(`
      INSERT INTO usuario (nombres, apellidos, correo, hash_contrasena, id_perfil, id_sucursal)
      VALUES ($1, $2, $3, $4,
              (SELECT id_perfil FROM perfil WHERE nombre = 'administrador'),
              (SELECT id_sucursal FROM sucursal ORDER BY id_sucursal LIMIT 1))
      RETURNING id_usuario`, [nombres, apellidos, correo, resumen]);
    await consulta("INSERT INTO bitacora_auditoria (accion, entidad, id_registro_afectado, detalle) VALUES ('alta_usuario', 'usuario', $1, 'Administrador creado desde la consola')", [rows[0].id_usuario]);
    console.log('\nAdministrador creado. Ya puede iniciar sesión.');
  }
})()
  .catch((error) => { console.error(`\nNo se completó: ${error.message}`); process.exitCode = 1; })
  .finally(async () => { rl.close(); await pool?.end(); });
