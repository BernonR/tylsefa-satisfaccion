'use strict';

// Retroalimentación del vendedor (M05): ve las calificaciones de sus clientes, marca
// "Enterado" (acuse) y confirma el coaching cuando su caso ya se cerró.

const { consulta } = require('../bd');

async function listar(idVendedor) {
  const { rows } = await consulta(`
    SELECT r.id_respuesta AS id, r.fecha_hora_captura AS "fechaHora", r.calificacion, r.concreto_compra AS compro,
           r.comentario, mo.descripcion AS motivo, r.es_prueba AS "esPrueba",
           c.numero_correlativo AS cotizacion, e.nombre AS cliente, e.codigo AS "codigoCliente", e.segmento,
           cs.numero_caso AS "numeroCaso", cs.estado AS "estadoCaso", cs.resolucion, cs.fecha_hora_cierre AS "cierreCaso",
           a.fecha_hora_acuse AS enterado,
           (SELECT min(b.fecha_hora) FROM bitacora_auditoria b WHERE b.accion = 'confirmacion_coaching'
               AND b.entidad = 'encuesta_respuesta' AND b.id_registro_afectado = r.id_respuesta) AS coaching
      FROM encuesta_respuesta r
      JOIN cotizacion c ON c.id_cotizacion = r.id_cotizacion
      JOIN empresa_cliente e ON e.id_cliente = c.id_cliente
      LEFT JOIN motivo_no_compra mo ON mo.id_motivo = r.id_motivo
      LEFT JOIN caso_servicio cs ON cs.id_respuesta = r.id_respuesta
      LEFT JOIN acuse_retroalimentacion a ON a.id_respuesta = r.id_respuesta
     WHERE c.id_vendedor = $1
     ORDER BY r.fecha_hora_captura DESC LIMIT 200`, [idVendedor]);
  return rows;
}

async function enterado(idRespuesta, idVendedor) {
  const { rows } = await consulta(`
    INSERT INTO acuse_retroalimentacion (id_respuesta, id_vendedor)
    SELECT r.id_respuesta, $2::int FROM encuesta_respuesta r JOIN cotizacion c ON c.id_cotizacion = r.id_cotizacion
     WHERE r.id_respuesta = $1 AND c.id_vendedor = $2
    ON CONFLICT (id_respuesta) DO NOTHING RETURNING id_acuse`, [idRespuesta, idVendedor]);
  if (!rows.length) return false;
  // El aviso de esa retroalimentación queda leído.
  await consulta(`UPDATE notificacion SET leida = true, fecha_lectura = now()
                   WHERE id_usuario_destinatario = $2 AND canal = 'aplicacion' AND NOT leida
                     AND id_caso IN (SELECT id_caso FROM caso_servicio WHERE id_respuesta = $1)`, [idRespuesta, idVendedor]);
  return true;
}

// Solo se confirma el coaching de un caso propio, ya cerrado y con el acuse registrado.
async function puedeConfirmarCoaching(idRespuesta, idVendedor) {
  const { rows } = await consulta(`
    SELECT cs.numero_caso AS "numeroCaso",
           EXISTS (SELECT 1 FROM bitacora_auditoria b WHERE b.accion = 'confirmacion_coaching'
                    AND b.entidad = 'encuesta_respuesta' AND b.id_registro_afectado = r.id_respuesta) AS ya
      FROM encuesta_respuesta r JOIN cotizacion c ON c.id_cotizacion = r.id_cotizacion
      JOIN caso_servicio cs ON cs.id_respuesta = r.id_respuesta
      JOIN acuse_retroalimentacion a ON a.id_respuesta = r.id_respuesta
     WHERE r.id_respuesta = $1 AND c.id_vendedor = $2 AND cs.estado = 'cerrado'`, [idRespuesta, idVendedor]);
  return rows[0] || null;
}

module.exports = { listar, enterado, puedeConfirmarCoaching };
