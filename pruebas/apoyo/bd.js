// Acceso a la base de desarrollo desde las pruebas: usa la misma conexión del servidor
// (backend/.env en la computadora, el secreto DATABASE_URL en GitHub Actions).
const path = require('node:path');

process.env.SESION_SECRETO ||= 'solo-para-las-pruebas';
const { pool, consulta } = require(path.join(__dirname, '..', '..', 'backend', 'src', 'bd'));

if (!pool) {
  throw new Error('Falta DATABASE_URL: agréguela en backend/.env (base de desarrollo) antes de correr las pruebas.');
}

// Última acción de la bitácora para un correo desde un momento dado.
async function ultimaAccion(correo, accion, desde) {
  const { rows } = await consulta(
    `SELECT b.accion, b.fecha_hora, extract(timezone_hour FROM b.fecha_hora)::int AS zona
       FROM bitacora_auditoria b JOIN usuario u ON u.id_usuario = b.id_usuario
      WHERE lower(u.correo) = lower($1) AND b.accion = $2 AND b.fecha_hora >= $3
      ORDER BY b.fecha_hora DESC LIMIT 1`,
    [correo, accion, desde],
  );
  return rows[0] || null;
}

module.exports = { pool, consulta, ultimaAccion, cerrar: () => pool.end() };
