'use strict';

// Casos de servicio (M05, CU-06): bandeja, primer contacto, actuaciones, cierre autorizado
// y escalamiento cuando vence el plazo de primer contacto. Los plazos son hábiles.

const { consulta } = require('../bd');
const { sumarMinutosHabiles } = require('./horario');

// Caso prioritario: mayorista que no compró con una cotización mayor a este monto (venta grande en riesgo).
// No cambia el plazo (sigue en horas hábiles): va primero en la bandeja y la gerencia recibe aviso urgente.
const MONTO_PRIORITARIO = 20000;

const CAMPOS = `
  cs.id_caso AS id, cs.numero_caso AS numero, cs.estado, cs.es_prueba AS "esPrueba",
  cs.fecha_hora_creacion AS creado, cs.fecha_hora_primer_contacto AS contactado,
  cs.fecha_hora_escalamiento AS escalado, cs.fecha_hora_cierre AS cerrado, cs.resolucion,
  cs.id_responsable AS "idResponsable", rp.nombres || ' ' || rp.apellidos AS responsable, rp.correo AS "correoResponsable",
  cs.id_usuario_copia AS "idCopia", cp.nombres || ' ' || cp.apellidos AS copia, cp.correo AS "correoCopia",
  pl.minutos_primer_contacto AS "minutosContacto", pl.horas_cierre AS "horasCierre",
  r.id_respuesta AS "idRespuesta", r.calificacion, r.concreto_compra AS compro, r.comentario, mo.descripcion AS motivo,
  r.fecha_hora_captura AS respondido,
  c.numero_correlativo AS cotizacion, c.monto_cotizado::float AS monto,
  e.codigo AS "codigoCliente", e.nombre AS cliente, e.segmento, e.correo_empresarial AS "correoCliente", e.contacto,
  c.id_vendedor AS "idVendedor", v.nombres || ' ' || v.apellidos AS vendedor, v.correo AS "correoVendedor",
  (e.segmento = 'mayorista' AND NOT r.concreto_compra AND c.monto_cotizado > ${MONTO_PRIORITARIO}) AS prioritario`;
const ORIGEN = `
  FROM caso_servicio cs
  JOIN encuesta_respuesta r ON r.id_respuesta = cs.id_respuesta
  JOIN cotizacion c ON c.id_cotizacion = r.id_cotizacion
  JOIN empresa_cliente e ON e.id_cliente = c.id_cliente
  JOIN usuario v ON v.id_usuario = c.id_vendedor
  JOIN usuario rp ON rp.id_usuario = cs.id_responsable
  LEFT JOIN usuario cp ON cp.id_usuario = cs.id_usuario_copia
  LEFT JOIN motivo_no_compra mo ON mo.id_motivo = r.id_motivo
  JOIN plazo_atencion pl ON pl.id_plazo = cs.id_plazo`;

// Vencimientos y semáforo del plazo que corre en este momento.
function conPlazos(caso, ahora = new Date()) {
  const venceContacto = sumarMinutosHabiles(caso.creado, caso.minutosContacto);
  const venceCierre = sumarMinutosHabiles(caso.creado, caso.horasCierre * 60);
  let plazo = 'cumplido';
  if (caso.estado !== 'cerrado') {
    const vence = caso.contactado ? venceCierre : venceContacto;
    plazo = ahora > vence ? 'vencido' : 'en_tiempo';
  } else if (new Date(caso.cerrado) > venceCierre || (caso.contactado && new Date(caso.contactado) > venceContacto)) {
    plazo = 'fuera_de_plazo';
  }
  return { ...caso, venceContacto, venceCierre, plazo };
}

// La gerencia ve todos los casos; el supervisor, los que tiene asignados o en copia.
function filtroAcceso(usuario, agregar) {
  if (usuario.permisos.includes('caso.cerrar.mayorista')) return null;
  const p = agregar(usuario.id_usuario);
  return `(cs.id_responsable = ${p} OR cs.id_usuario_copia = ${p})`;
}

async function listar(usuario, { estado = '', buscar = '' } = {}) {
  const filtros = [];
  const valores = [];
  const agregar = (v) => { valores.push(v); return `$${valores.length}`; };
  const acceso = filtroAcceso(usuario, agregar);
  if (acceso) filtros.push(acceso);
  if (estado === 'pendientes') filtros.push("cs.estado <> 'cerrado'");
  // "Escalados": pendientes a los que se les venció el primer contacto, aunque ya estén en seguimiento.
  else if (estado === 'escalado') filtros.push("cs.fecha_hora_escalamiento IS NOT NULL AND cs.estado <> 'cerrado'");
  else if (['abierto', 'en_seguimiento', 'cerrado'].includes(estado)) filtros.push(`cs.estado = ${agregar(estado)}`);
  if (buscar) {
    const p = agregar(`%${buscar.toLowerCase()}%`);
    filtros.push(`(lower(cs.numero_caso) LIKE ${p} OR lower(c.numero_correlativo) LIKE ${p} OR lower(e.nombre) LIKE ${p}
                  OR lower(e.codigo) LIKE ${p} OR lower(v.nombres || ' ' || v.apellidos) LIKE ${p})`);
  }
  const donde = filtros.length ? `WHERE ${filtros.join(' AND ')}` : '';
  const { rows } = await consulta(`SELECT ${CAMPOS} ${ORIGEN} ${donde}
    ORDER BY (cs.estado = 'cerrado'),
             (cs.estado <> 'cerrado' AND e.segmento = 'mayorista' AND NOT r.concreto_compra AND c.monto_cotizado > ${MONTO_PRIORITARIO}) DESC,
             cs.fecha_hora_creacion DESC LIMIT 300`, valores);
  return rows.map((c) => conPlazos(c));
}

async function obtener(id) {
  const { rows } = await consulta(`SELECT ${CAMPOS} ${ORIGEN} WHERE cs.id_caso = $1`, [id]);
  return rows[0] ? conPlazos(rows[0]) : null;
}

function puedeVer(usuario, caso) {
  return usuario.permisos.includes('caso.cerrar.mayorista') || [caso.idResponsable, caso.idCopia].includes(usuario.id_usuario);
}

// Primer contacto (CU-06, paso 4): lo registra el responsable. En mayoristas el responsable es la
// gerencia; el supervisor va en copia y solo agrega actuaciones internas.
function puedeContactar(usuario, caso) {
  return caso.segmento !== 'mayorista' || usuario.permisos.includes('caso.cerrar.mayorista');
}

// Minorista: supervisor o gerente. Mayorista: solo la gerencia (RF10, RS06).
function puedeCerrar(usuario, caso) {
  return usuario.permisos.includes(caso.segmento === 'mayorista' ? 'caso.cerrar.mayorista' : 'caso.cerrar.minorista');
}

async function detalle(id) {
  const caso = await obtener(id);
  if (!caso) return null;
  const [actuaciones, acuse, coaching] = await Promise.all([
    consulta(`SELECT a.id_actuacion AS id, a.fecha_hora AS "fechaHora", a.descripcion, u.nombres || ' ' || u.apellidos AS autor
                FROM actuacion_caso a JOIN usuario u ON u.id_usuario = a.id_usuario
               WHERE a.id_caso = $1 ORDER BY a.fecha_hora, a.id_actuacion`, [id]),
    consulta('SELECT fecha_hora_acuse AS fecha FROM acuse_retroalimentacion WHERE id_respuesta = $1', [caso.idRespuesta]),
    consulta(`SELECT fecha_hora AS fecha FROM bitacora_auditoria
               WHERE accion = 'confirmacion_coaching' AND entidad = 'encuesta_respuesta' AND id_registro_afectado = $1
               ORDER BY fecha_hora LIMIT 1`, [caso.idRespuesta]),
  ]);
  return { ...caso, actuaciones: actuaciones.rows, acuseVendedor: acuse.rows[0]?.fecha || null, coachingConfirmado: coaching.rows[0]?.fecha || null };
}

async function actuar(idCaso, idUsuario, descripcion) {
  await consulta('INSERT INTO actuacion_caso (id_caso, id_usuario, descripcion) VALUES ($1, $2, $3)', [idCaso, idUsuario, descripcion]);
}

// La condición va en la misma instrucción: dos personas no pueden registrar el contacto a la vez.
async function registrarContacto(idCaso, idUsuario, nota) {
  const { rows } = await consulta(`
    UPDATE caso_servicio SET fecha_hora_primer_contacto = now(), estado = 'en_seguimiento'
     WHERE id_caso = $1 AND fecha_hora_primer_contacto IS NULL AND estado <> 'cerrado' RETURNING id_caso`, [idCaso]);
  if (!rows.length) return false;
  await actuar(idCaso, idUsuario, `Primer contacto con el cliente. ${nota}`);
  return true;
}

async function agregarActuacion(idCaso, idUsuario, descripcion) {
  const { rows } = await consulta("SELECT 1 FROM caso_servicio WHERE id_caso = $1 AND estado <> 'cerrado'", [idCaso]);
  if (!rows.length) return false;
  await actuar(idCaso, idUsuario, descripcion);
  return true;
}

async function cerrar(idCaso, idUsuario, resolucion) {
  const { rows } = await consulta(`
    UPDATE caso_servicio SET estado = 'cerrado', fecha_hora_cierre = now(), resolucion = $2
     WHERE id_caso = $1 AND estado <> 'cerrado' AND fecha_hora_primer_contacto IS NOT NULL RETURNING id_caso`, [idCaso, resolucion]);
  if (!rows.length) return false;
  await actuar(idCaso, idUsuario, `Caso cerrado. ${resolucion}`);
  return true;
}

// Casos sin primer contacto cuyo plazo ya venció: pasan a escalado y la gerencia queda en copia.
async function escalarVencidos(ahora = new Date()) {
  const { rows } = await consulta(`SELECT ${CAMPOS} ${ORIGEN}
    WHERE cs.estado = 'abierto' AND cs.fecha_hora_primer_contacto IS NULL AND cs.fecha_hora_escalamiento IS NULL`);
  const escalados = [];
  for (const caso of rows) {
    if (ahora <= sumarMinutosHabiles(caso.creado, caso.minutosContacto)) continue;
    const { rows: hecho } = await consulta(`
      UPDATE caso_servicio cs SET estado = 'escalado', fecha_hora_escalamiento = now(),
             id_usuario_copia = CASE WHEN $2 = 'minorista'
               THEN coalesce((SELECT u.id_usuario FROM usuario u JOIN perfil p ON p.id_perfil = u.id_perfil
                               WHERE p.nombre = 'gerente' AND u.activo
       -- Las cuentas de las pruebas automáticas van al final: el caso real llega a la gerente real.
       ORDER BY (u.correo LIKE '%@pruebas.tylsefa.com'), u.id_usuario LIMIT 1), cs.id_usuario_copia)
               ELSE cs.id_usuario_copia END
       WHERE cs.id_caso = $1 AND cs.estado = 'abierto' AND cs.fecha_hora_escalamiento IS NULL RETURNING cs.id_caso`,
    [caso.id, caso.segmento]);
    if (hecho.length) escalados.push(caso.id);
  }
  return escalados;
}

// Casos sin cerrar cuyo plazo de cierre ya pasó y que aún no tienen su alerta (una sola por caso).
async function cierresVencidos(ahora = new Date()) {
  const { rows } = await consulta(`SELECT ${CAMPOS} ${ORIGEN}
    WHERE cs.estado <> 'cerrado'
      AND NOT EXISTS (SELECT 1 FROM notificacion n WHERE n.id_caso = cs.id_caso AND n.tipo = 'cierre_vencido')`);
  return rows.filter((c) => ahora > sumarMinutosHabiles(c.creado, c.horasCierre * 60)).map((c) => c.id);
}

module.exports = { MONTO_PRIORITARIO, cierresVencidos, listar, obtener, detalle, puedeVer, puedeContactar, puedeCerrar, registrarContacto, agregarActuacion, cerrar, escalarVencidos, conPlazos };
