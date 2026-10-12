'use strict';

// Registro y consulta de cotizaciones (M03, CU-04).

const { consulta } = require('../bd');

const DIAS_VIGENCIA = 7; // días que tiene el cliente para calificar en la terminal

const CAMPOS = `
  c.id_cotizacion AS id, c.numero_correlativo AS numero, c.fecha_hora AS "fechaHora",
  c.monto_cotizado::float AS monto, c.estado, c.motivo_anulacion AS "motivoAnulacion", c.es_prueba AS "esPrueba",
  c.id_vendedor AS "idVendedor", v.nombres || ' ' || v.apellidos AS vendedor,
  c.id_cliente AS "idCliente", e.codigo AS "codigoCliente", e.nombre AS cliente, e.segmento,
  s.nombres || ' ' || s.apellidos AS "registradaPor",
  (c.estado = 'pendiente' AND c.fecha_hora < now() - make_interval(days => ${DIAS_VIGENCIA})) AS vencida`;
const ORIGEN = `
  FROM cotizacion c
  JOIN usuario v ON v.id_usuario = c.id_vendedor
  JOIN usuario s ON s.id_usuario = c.id_supervisor_registro
  JOIN empresa_cliente e ON e.id_cliente = c.id_cliente`;

async function listar({ buscar = '', estado = '', dias = 0, idVendedor = null } = {}) {
  const filtros = [];
  const valores = [];
  const agregar = (valor) => { valores.push(valor); return `$${valores.length}`; };
  if (idVendedor) filtros.push(`c.id_vendedor = ${agregar(idVendedor)}`);
  if (buscar) {
    const p = agregar(`%${buscar.toLowerCase()}%`);
    filtros.push(`(lower(c.numero_correlativo) LIKE ${p} OR lower(e.nombre) LIKE ${p} OR lower(e.codigo) LIKE ${p} OR lower(v.nombres || ' ' || v.apellidos) LIKE ${p})`);
  }
  if (estado === 'vencida') {
    filtros.push(`c.estado = 'pendiente' AND c.fecha_hora < now() - make_interval(days => ${DIAS_VIGENCIA})`);
  } else if (estado === 'pendiente') {
    filtros.push(`c.estado = 'pendiente' AND c.fecha_hora >= now() - make_interval(days => ${DIAS_VIGENCIA})`);
  } else if (['respondida', 'anulada'].includes(estado)) {
    filtros.push(`c.estado = ${agregar(estado)}`);
  }
  if (dias > 0) filtros.push(`c.fecha_hora >= now() - make_interval(days => ${agregar(dias)}::int)`);
  const donde = filtros.length ? `WHERE ${filtros.join(' AND ')}` : '';
  const { rows } = await consulta(`SELECT ${CAMPOS} ${ORIGEN} ${donde} ORDER BY c.fecha_hora DESC LIMIT 500`, valores);
  return rows;
}

async function obtener(id) {
  const { rows } = await consulta(`SELECT ${CAMPOS} ${ORIGEN} WHERE c.id_cotizacion = $1`, [id]);
  return rows[0] || null;
}

async function numeroEnUso(numero, excepto = null) {
  const { rows } = await consulta(
    'SELECT 1 FROM cotizacion WHERE numero_correlativo = $1 AND ($2::int IS NULL OR id_cotizacion <> $2)',
    [numero, excepto],
  );
  return rows.length > 0;
}

async function vendedorActivo(id) {
  const { rows } = await consulta(
    `SELECT 1 FROM usuario u JOIN perfil p ON p.id_perfil = u.id_perfil
     WHERE u.id_usuario = $1 AND u.activo AND p.nombre = 'vendedor'`, [id]);
  return rows.length > 0;
}

async function clienteActivo(id) {
  const { rows } = await consulta('SELECT 1 FROM empresa_cliente WHERE id_cliente = $1 AND activo', [id]);
  return rows.length > 0;
}

// Opciones del formulario: vendedores y empresas activos.
async function opciones() {
  const [vendedores, clientes] = await Promise.all([
    consulta(`SELECT u.id_usuario AS id, u.nombres || ' ' || u.apellidos AS nombre
              FROM usuario u JOIN perfil p ON p.id_perfil = u.id_perfil
              WHERE u.activo AND p.nombre = 'vendedor' ORDER BY u.nombres, u.apellidos`),
    consulta(`SELECT id_cliente AS id, codigo, nombre, segmento FROM empresa_cliente
              WHERE activo ORDER BY lower(nombre)`),
  ]);
  return { vendedores: vendedores.rows, clientes: clientes.rows };
}

async function crear(datos, idSupervisor) {
  const { rows } = await consulta(`
    INSERT INTO cotizacion (numero_correlativo, id_vendedor, id_cliente, id_supervisor_registro, monto_cotizado, es_prueba)
    VALUES ($1, $2, $3, $4, $5, $6) RETURNING id_cotizacion AS id`,
  [datos.numero, datos.idVendedor, datos.idCliente, idSupervisor, datos.monto, datos.esPrueba]);
  return rows[0].id;
}

// Solo se corrige mientras esté pendiente; la condición va en la misma instrucción.
async function corregir(id, datos) {
  const { rows } = await consulta(`
    UPDATE cotizacion SET numero_correlativo = $2, id_vendedor = $3, id_cliente = $4, monto_cotizado = $5, es_prueba = $6
    WHERE id_cotizacion = $1 AND estado = 'pendiente' RETURNING id_cotizacion`,
  [id, datos.numero, datos.idVendedor, datos.idCliente, datos.monto, datos.esPrueba]);
  return rows.length > 0;
}

async function anular(id, motivo) {
  const { rows } = await consulta(`
    UPDATE cotizacion SET estado = 'anulada', motivo_anulacion = $2
    WHERE id_cotizacion = $1 AND estado = 'pendiente' RETURNING id_cotizacion`, [id, motivo]);
  return rows.length > 0;
}

module.exports = { DIAS_VIGENCIA, listar, obtener, numeroEnUso, vendedorActivo, clienteActivo, opciones, crear, corregir, anular };
