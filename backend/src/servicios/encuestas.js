'use strict';

// Encuesta en la terminal de autoservicio (M04, CU-05).
// Una cotización admite una sola respuesta, solo mientras está pendiente y dentro de su vigencia.
// Con calificación de 1 o 2 se abre el caso de servicio (RF09) con su responsable según el
// segmento (RF10): minorista → supervisor del vendedor; mayorista → gerencia con copia al supervisor.

const { consulta } = require('../bd');
const { DIAS_VIGENCIA } = require('./cotizaciones');

const LIMITE_INSATISFACCION = 2;

async function motivos() {
  const { rows } = await consulta('SELECT id_motivo AS id, descripcion FROM motivo_no_compra WHERE activo ORDER BY id_motivo');
  return rows;
}

// Lo único que ve el cliente: número, empresa y quien le atendió. Nunca el monto.
async function buscarPendiente(numero) {
  const { rows } = await consulta(`
    SELECT c.numero_correlativo AS numero, e.nombre AS cliente, v.nombres AS "nombresVendedor", v.apellidos AS "apellidosVendedor"
      FROM cotizacion c
      JOIN empresa_cliente e ON e.id_cliente = c.id_cliente
      JOIN usuario v ON v.id_usuario = c.id_vendedor
     WHERE c.numero_correlativo = $1 AND c.estado = 'pendiente'
       AND c.fecha_hora >= now() - make_interval(days => ${DIAS_VIGENCIA})`, [numero]);
  const c = rows[0];
  if (!c) return null;
  const nombre = (t) => String(t).trim().split(/\s+/)[0];
  return { numero: c.numero, cliente: c.cliente, vendedor: `${nombre(c.nombresVendedor)} ${nombre(c.apellidosVendedor)}` };
}

// Todo en una sola instrucción: la cotización se bloquea, se marca como calificada, se guarda
// la respuesta y, si corresponde, se abre el caso. O se hace todo o no se hace nada (RNF06).
// La vigencia se mide contra la hora de captura, por si la respuesta llegó tarde sin internet.
async function registrar(r, intentos = 3) {
  try {
    return await insertar(r);
  } catch (error) {
    // Dos casos al mismo instante podrían tomar el mismo número: se reintenta.
    if (error.code === '23505' && error.constraint === 'caso_servicio_numero_caso_key' && intentos > 1) return registrar(r, intentos - 1);
    throw error;
  }
}

async function insertar(r) {
  const { rows } = await consulta(`
    WITH cot AS (
      SELECT c.id_cotizacion, c.numero_correlativo, c.es_prueba, c.id_supervisor_registro, e.segmento, v.id_supervisor
        FROM cotizacion c
        JOIN empresa_cliente e ON e.id_cliente = c.id_cliente
        JOIN usuario v ON v.id_usuario = c.id_vendedor
       WHERE c.numero_correlativo = $1::varchar AND c.estado = 'pendiente'
         AND c.fecha_hora >= $6::timestamptz - make_interval(days => ${DIAS_VIGENCIA})
         FOR UPDATE OF c
    ), marcada AS (
      UPDATE cotizacion SET estado = 'respondida'
       WHERE id_cotizacion = (SELECT id_cotizacion FROM cot) RETURNING id_cotizacion
    ), respuesta AS (
      INSERT INTO encuesta_respuesta (id_cotizacion, calificacion, concreto_compra, id_motivo, comentario, fecha_hora_captura, es_prueba)
      SELECT m.id_cotizacion, $2::smallint, $3::boolean, $4::int, $5::text, $6::timestamptz, cot.es_prueba FROM marcada m CROSS JOIN cot
      RETURNING id_respuesta
    ), supervisor AS (
      -- El supervisor del vendedor; si no tiene o está inactivo, quien registró la cotización.
      SELECT coalesce((SELECT u.id_usuario FROM usuario u WHERE u.id_usuario = cot.id_supervisor AND u.activo),
                      cot.id_supervisor_registro) AS id
        FROM cot
    ), gerente AS (
      SELECT u.id_usuario AS id FROM usuario u JOIN perfil p ON p.id_perfil = u.id_perfil
       WHERE p.nombre = 'gerente' AND u.activo ORDER BY u.id_usuario LIMIT 1
    ), caso AS (
      INSERT INTO caso_servicio (numero_caso, id_respuesta, id_responsable, id_usuario_copia, id_plazo, es_prueba)
      SELECT 'CASO-' || lpad((coalesce((SELECT max(substring(numero_caso FROM 6)::int) FROM caso_servicio
                                         WHERE numero_caso ~ '^CASO-[0-9]+$'), 0) + 1)::text, 6, '0'),
             r.id_respuesta,
             CASE WHEN cot.segmento = 'mayorista' THEN coalesce((SELECT id FROM gerente), s.id) ELSE s.id END,
             CASE WHEN cot.segmento = 'mayorista' AND EXISTS (SELECT 1 FROM gerente) THEN s.id END,
             pl.id_plazo, cot.es_prueba
        FROM respuesta r CROSS JOIN cot CROSS JOIN supervisor s
        JOIN plazo_atencion pl ON pl.segmento = cot.segmento AND pl.vigente
       WHERE $2::smallint <= ${LIMITE_INSATISFACCION}
      RETURNING id_caso, numero_caso, id_plazo
    )
    SELECT r.id_respuesta AS "idRespuesta", cot.numero_correlativo AS numero, cot.segmento,
           (SELECT id_caso FROM caso) AS "idCaso", (SELECT numero_caso FROM caso) AS "numeroCaso",
           (SELECT minutos_primer_contacto FROM plazo_atencion WHERE id_plazo = (SELECT id_plazo FROM caso)) AS "minutosPrimerContacto"
      FROM respuesta r CROSS JOIN cot`,
  [r.numero, r.calificacion, r.compro, r.idMotivo, r.comentario, r.capturadaEn]);
  return rows[0] || null;
}

module.exports = { LIMITE_INSATISFACCION, motivos, buscarPendiente, registrar };
