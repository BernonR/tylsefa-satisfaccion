'use strict';

const { consulta } = require('../bd');

const CAMPOS = `
  u.id_usuario, u.nombres, u.apellidos, u.correo, u.hash_contrasena, u.activo,
  u.id_supervisor, u.id_sucursal, p.nombre AS perfil,
  COALESCE(array_agg(m.codigo ORDER BY m.codigo) FILTER (WHERE m.codigo IS NOT NULL), '{}') AS permisos
`;
const ORIGEN = `
  FROM usuario u
  JOIN perfil p ON p.id_perfil = u.id_perfil
  LEFT JOIN perfil_permiso pp ON pp.id_perfil = u.id_perfil
  LEFT JOIN permiso m ON m.id_permiso = pp.id_permiso
`;
const AGRUPAR = 'GROUP BY u.id_usuario, p.nombre';

async function buscarPorCorreo(correo) {
  const { rows } = await consulta(`SELECT ${CAMPOS} ${ORIGEN} WHERE lower(u.correo) = lower($1) ${AGRUPAR}`, [correo]);
  return rows[0] || null;
}

async function buscarPorId(id) {
  const { rows } = await consulta(`SELECT ${CAMPOS} ${ORIGEN} WHERE u.id_usuario = $1 ${AGRUPAR}`, [id]);
  return rows[0] || null;
}

// Lista para la pantalla Usuarios (administrador) y para el catálogo de personal (consulta).
async function listar() {
  const { rows } = await consulta(`
    SELECT u.id_usuario AS id, u.nombres, u.apellidos, u.correo, u.activo, p.nombre AS perfil,
           u.id_supervisor AS "idSupervisor", s.nombres || ' ' || s.apellidos AS supervisor,
           (SELECT count(*)::int FROM usuario v WHERE v.id_supervisor = u.id_usuario AND v.activo) AS "vendedoresACargo"
    FROM usuario u
    JOIN perfil p ON p.id_perfil = u.id_perfil
    LEFT JOIN usuario s ON s.id_usuario = u.id_supervisor
    ORDER BY u.activo DESC, array_position(ARRAY['gerente','supervisor','vendedor','administrador'], p.nombre::text), u.apellidos, u.nombres`);
  return rows;
}

async function listarSupervisores() {
  const { rows } = await consulta(`
    SELECT u.id_usuario AS id, u.nombres || ' ' || u.apellidos AS nombre
    FROM usuario u JOIN perfil p ON p.id_perfil = u.id_perfil
    WHERE p.nombre = 'supervisor' AND u.activo
    ORDER BY u.apellidos, u.nombres`);
  return rows;
}

async function correoEnUso(correo, excepto = null) {
  const { rows } = await consulta(
    'SELECT 1 FROM usuario WHERE lower(correo) = lower($1) AND ($2::int IS NULL OR id_usuario <> $2)',
    [correo, excepto],
  );
  return rows.length > 0;
}

async function esSupervisorActivo(id) {
  const { rows } = await consulta(
    `SELECT 1 FROM usuario u JOIN perfil p ON p.id_perfil = u.id_perfil
     WHERE u.id_usuario = $1 AND p.nombre = 'supervisor' AND u.activo`,
    [id],
  );
  return rows.length > 0;
}

async function vendedoresACargo(id) {
  const { rows } = await consulta('SELECT count(*)::int AS n FROM usuario WHERE id_supervisor = $1 AND activo', [id]);
  return rows[0].n;
}

async function crear({ nombres, apellidos, correo, perfil, idSupervisor }, resumen) {
  const { rows } = await consulta(`
    INSERT INTO usuario (nombres, apellidos, correo, hash_contrasena, id_perfil, id_supervisor, id_sucursal)
    VALUES ($1, $2, $3, $4, (SELECT id_perfil FROM perfil WHERE nombre = $5), $6,
            (SELECT id_sucursal FROM sucursal ORDER BY id_sucursal LIMIT 1))
    RETURNING id_usuario AS id`,
  [nombres, apellidos, correo, resumen, perfil, idSupervisor]);
  return rows[0].id;
}

async function actualizar(id, { nombres, apellidos, correo, perfil, idSupervisor }) {
  await consulta(`
    UPDATE usuario SET nombres = $2, apellidos = $3, correo = $4,
      id_perfil = (SELECT id_perfil FROM perfil WHERE nombre = $5), id_supervisor = $6
    WHERE id_usuario = $1`,
  [id, nombres, apellidos, correo, perfil, idSupervisor]);
}

async function cambiarEstado(id, activo) {
  await consulta('UPDATE usuario SET activo = $2 WHERE id_usuario = $1', [id, activo]);
}

async function cambiarContrasena(id, resumen) {
  await consulta('UPDATE usuario SET hash_contrasena = $2 WHERE id_usuario = $1', [id, resumen]);
}

// Datos que se envían a la interfaz: nunca el resumen de la contraseña.
function publico(u) {
  return {
    id: u.id_usuario,
    nombres: u.nombres,
    apellidos: u.apellidos,
    correo: u.correo,
    perfil: u.perfil,
    permisos: u.permisos,
  };
}

module.exports = {
  buscarPorCorreo, buscarPorId, listar, listarSupervisores, correoEnUso, esSupervisorActivo,
  vendedoresACargo, crear, actualizar, cambiarEstado, cambiarContrasena, publico,
};
