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

async function listar() {
  const { rows } = await consulta(`
    SELECT u.id_usuario, u.nombres, u.apellidos, u.correo, u.activo, p.nombre AS perfil,
           s.nombres || ' ' || s.apellidos AS supervisor
    FROM usuario u
    JOIN perfil p ON p.id_perfil = u.id_perfil
    LEFT JOIN usuario s ON s.id_usuario = u.id_supervisor
    ORDER BY u.activo DESC, u.apellidos, u.nombres`);
  return rows;
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

module.exports = { buscarPorCorreo, buscarPorId, listar, publico };
