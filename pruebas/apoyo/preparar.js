// Se ejecuta una vez antes de las pruebas: crea o actualiza las cuentas de prueba
// en la base de desarrollo con una contraseña nueva al azar.
const crypto = require('node:crypto');
const path = require('node:path');
const usuarios = require('../datos/usuarios.json');

module.exports = async function preparar() {
  const { consulta, cerrar } = require('./bd');
  const { generarResumen } = require(path.join(__dirname, '..', '..', 'backend', 'src', 'seguridad', 'contrasenas'));

  const clave = `Pr${crypto.randomBytes(9).toString('base64url')}7a`;
  const resumen = await generarResumen(clave);
  const { rows: [sucursal] } = await consulta('SELECT id_sucursal FROM sucursal ORDER BY id_sucursal LIMIT 1');

  for (const [clavePerfil, u] of Object.entries(usuarios)) {
    if (clavePerfil.startsWith('_')) continue;
    await consulta(
      `INSERT INTO usuario (nombres, apellidos, correo, hash_contrasena, id_perfil, id_sucursal, activo)
       VALUES ($1, $2, $3, $4, (SELECT id_perfil FROM perfil WHERE nombre = $5), $6, $7)
       ON CONFLICT (correo) DO UPDATE SET nombres = EXCLUDED.nombres, apellidos = EXCLUDED.apellidos,
         hash_contrasena = EXCLUDED.hash_contrasena, id_perfil = EXCLUDED.id_perfil, activo = EXCLUDED.activo`,
      [u.nombres, u.apellidos, u.correo, resumen, u.perfil, sucursal.id_sucursal, u.activo],
    );
  }
  await cerrar();
  // Las pruebas leen la contraseña de aquí; nunca se escribe en un archivo.
  process.env.CLAVE_PRUEBAS = clave;
};
