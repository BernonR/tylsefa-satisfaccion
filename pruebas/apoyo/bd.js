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

// Borra lo que crean las pruebas (M02 a M05) para que no se acumule en la base de desarrollo.
// Primero lo que depende de las cotizaciones, porque estas apuntan a usuarios y empresas de prueba.
const USUARIOS_TEMPORALES = "(SELECT id_usuario FROM usuario WHERE correo ~ '^m0[0-9]-.*@pruebas[.]tylsefa[.]com$')";
const DE_PRUEBA = "(SELECT id_usuario FROM usuario WHERE correo LIKE '%@pruebas.tylsefa.com')";
const COTIZACIONES_DE_PRUEBA = `(SELECT id_cotizacion FROM cotizacion
   WHERE id_vendedor IN ${DE_PRUEBA} OR id_supervisor_registro IN ${DE_PRUEBA}
      OR id_cliente IN (SELECT id_cliente FROM empresa_cliente WHERE nombre LIKE 'Prueba automática %'))`;
const RESPUESTAS_DE_PRUEBA = `(SELECT id_respuesta FROM encuesta_respuesta WHERE id_cotizacion IN ${COTIZACIONES_DE_PRUEBA})`;
const CASOS_DE_PRUEBA = `(SELECT id_caso FROM caso_servicio WHERE id_respuesta IN ${RESPUESTAS_DE_PRUEBA})`;
async function limpiarCatalogos() {
  // Del final hacia el principio: avisos y actuaciones, casos, respuestas y cotizaciones.
  await consulta(`DELETE FROM notificacion WHERE id_caso IN ${CASOS_DE_PRUEBA}`);
  await consulta(`DELETE FROM actuacion_caso WHERE id_caso IN ${CASOS_DE_PRUEBA}`);
  await consulta(`DELETE FROM caso_servicio WHERE id_caso IN ${CASOS_DE_PRUEBA}`);
  await consulta(`DELETE FROM acuse_retroalimentacion WHERE id_respuesta IN ${RESPUESTAS_DE_PRUEBA}`);
  await consulta(`DELETE FROM encuesta_respuesta WHERE id_respuesta IN ${RESPUESTAS_DE_PRUEBA}`);
  await consulta(`DELETE FROM cotizacion WHERE id_cotizacion IN ${COTIZACIONES_DE_PRUEBA}`);
  await consulta(`UPDATE bitacora_auditoria SET id_usuario = NULL WHERE id_usuario IN ${USUARIOS_TEMPORALES}`);
  await consulta(`UPDATE usuario SET id_supervisor = NULL WHERE id_supervisor IN ${USUARIOS_TEMPORALES}`);
  await consulta(`DELETE FROM usuario WHERE id_usuario IN ${USUARIOS_TEMPORALES}`);
  await consulta("DELETE FROM empresa_cliente WHERE nombre LIKE 'Prueba automática %'");
}

module.exports = { pool, consulta, ultimaAccion, limpiarCatalogos, cerrar: () => pool.end() };
