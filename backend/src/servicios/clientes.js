'use strict';

// Catálogo de empresas cliente (M02).

const { consulta } = require('../bd');

const CAMPOS = `id_cliente AS id, codigo, nombre, nit, segmento, correo_empresarial AS correo, contacto, activo`;

async function listar({ buscar = '', segmento = '', estado = 'activos' } = {}) {
  const filtros = [];
  const valores = [];
  if (buscar) {
    valores.push(`%${buscar.toLowerCase()}%`);
    filtros.push(`(lower(nombre) LIKE $${valores.length} OR lower(codigo) LIKE $${valores.length} OR lower(coalesce(contacto, '')) LIKE $${valores.length})`);
  }
  if (segmento === 'minorista' || segmento === 'mayorista') {
    valores.push(segmento);
    filtros.push(`segmento = $${valores.length}`);
  }
  if (estado === 'activos') filtros.push('activo');
  if (estado === 'inactivos') filtros.push('NOT activo');
  const donde = filtros.length ? `WHERE ${filtros.join(' AND ')}` : '';
  const { rows } = await consulta(`SELECT ${CAMPOS} FROM empresa_cliente ${donde} ORDER BY lower(nombre) LIMIT 500`, valores);
  return rows;
}

async function obtener(id) {
  const { rows } = await consulta(`SELECT ${CAMPOS} FROM empresa_cliente WHERE id_cliente = $1`, [id]);
  return rows[0] || null;
}

// El código sigue la serie CLI-0001, CLI-0002… Si dos registros chocan, se reintenta.
async function crear({ nombre, segmento, correo, contacto, nit }) {
  for (let intento = 0; intento < 3; intento++) {
    try {
      const { rows } = await consulta(`
        INSERT INTO empresa_cliente (codigo, nombre, nit, segmento, correo_empresarial, contacto)
        VALUES ((SELECT 'CLI-' || lpad((coalesce(max(substring(codigo FROM 5)::int), 0) + 1)::text, 4, '0')
                   FROM empresa_cliente WHERE codigo ~ '^CLI-[0-9]+$'),
                $1, $2, $3, $4, $5)
        RETURNING ${CAMPOS}`,
      [nombre, nit, segmento, correo, contacto]);
      return rows[0];
    } catch (error) {
      if (error.code !== '23505' || intento === 2) throw error;
    }
  }
  return null;
}

async function actualizar(id, { nombre, segmento, correo, contacto, nit }) {
  const { rows } = await consulta(`
    UPDATE empresa_cliente SET nombre = $2, nit = $3, segmento = $4, correo_empresarial = $5, contacto = $6
    WHERE id_cliente = $1 RETURNING ${CAMPOS}`,
  [id, nombre, nit, segmento, correo, contacto]);
  return rows[0] || null;
}

async function cambiarEstado(id, activo) {
  const { rows } = await consulta(`UPDATE empresa_cliente SET activo = $2 WHERE id_cliente = $1 RETURNING ${CAMPOS}`, [id, activo]);
  return rows[0] || null;
}

module.exports = { listar, obtener, crear, actualizar, cambiarEstado };
