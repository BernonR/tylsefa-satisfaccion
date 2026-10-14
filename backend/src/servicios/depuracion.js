'use strict';

// Depuración de registros de prueba (RF15): borra únicamente las cotizaciones marcadas
// como prueba y todo lo que depende de ellas. Los registros reales nunca se tocan.

const { consulta } = require('../bd');

const COTIZACIONES = 'SELECT id_cotizacion FROM cotizacion WHERE es_prueba';
const RESPUESTAS = `SELECT id_respuesta FROM encuesta_respuesta WHERE id_cotizacion IN (${COTIZACIONES})`;
const CASOS = `SELECT id_caso FROM caso_servicio WHERE id_respuesta IN (${RESPUESTAS})`;

async function resumen() {
  const { rows: [fila] } = await consulta(`
    SELECT (SELECT count(*)::int FROM cotizacion WHERE es_prueba) AS cotizaciones,
           (SELECT count(*)::int FROM encuesta_respuesta WHERE id_cotizacion IN (${COTIZACIONES})) AS respuestas,
           (SELECT count(*)::int FROM caso_servicio WHERE id_respuesta IN (${RESPUESTAS})) AS casos`);
  return fila;
}

// Una sola instrucción: o se borra todo o no se borra nada.
async function depurar() {
  const { rows: [fila] } = await consulta(`
    WITH avisos AS (DELETE FROM notificacion WHERE id_caso IN (${CASOS}) RETURNING 1),
         actuaciones AS (DELETE FROM actuacion_caso WHERE id_caso IN (${CASOS}) RETURNING 1),
         casos AS (DELETE FROM caso_servicio WHERE id_caso IN (${CASOS}) RETURNING 1),
         acuses AS (DELETE FROM acuse_retroalimentacion WHERE id_respuesta IN (${RESPUESTAS}) RETURNING 1),
         respuestas AS (DELETE FROM encuesta_respuesta WHERE id_respuesta IN (${RESPUESTAS}) RETURNING 1),
         cotizaciones AS (DELETE FROM cotizacion WHERE es_prueba RETURNING 1)
    SELECT (SELECT count(*)::int FROM cotizaciones) AS cotizaciones, (SELECT count(*)::int FROM respuestas) AS respuestas,
           (SELECT count(*)::int FROM casos) AS casos, (SELECT count(*)::int FROM avisos) AS avisos`);
  return fila;
}

module.exports = { resumen, depurar };
