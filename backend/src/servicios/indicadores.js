'use strict';

// Tablero de indicadores (M06, RF13): satisfacción, insatisfacción, oportunidad de atención,
// motivos de no compra e ingreso expuesto del periodo, según el alcance del perfil:
// el vendedor ve sus interacciones, el supervisor las de su equipo y la gerencia la sucursal.
// Los registros de prueba no cuentan (RF15), salvo que la gerencia los incluya a propósito.

const { consulta } = require('../bd');
const { sumarMinutosHabiles, minutosHabilesEntre } = require('./horario');

const DIA = 86400000;
const DESFASE = -6 * 3600000; // Guatemala: UTC-6 todo el año
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const MAXIMO_DIAS = 366;

// ---------------------------------------------------------------- Alcance y periodo

function alcance(usuario) {
  if (usuario.permisos.includes('tablero.sucursal')) return 'sucursal';
  if (usuario.permisos.includes('tablero.equipo')) return 'equipo';
  if (usuario.permisos.includes('tablero.propio')) return 'propio';
  return null;
}

const fechaISO = (ms) => new Date(ms).toISOString().slice(0, 10);
const hoyLocal = (ahora = new Date()) => fechaISO(ahora.getTime() + DESFASE);
const aMs = (iso) => Date.parse(`${iso}T00:00:00Z`);
const valida = (t) => typeof t === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(t) && fechaISO(aMs(t)) === t;

// Periodo pedido (fechas locales de Guatemala, ambos días incluidos). Sin fechas: el mes en curso.
function validarPeriodo({ desde, hasta } = {}, ahora = new Date()) {
  if (!desde && !hasta) {
    const hoy = hoyLocal(ahora);
    desde = `${hoy.slice(0, 7)}-01`;
    const d = new Date(aMs(desde));
    hasta = fechaISO(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
  }
  if (!valida(desde) || !valida(hasta)) return { error: 'Indique un periodo con fechas válidas.' };
  const dias = (aMs(hasta) - aMs(desde)) / DIA + 1;
  if (dias < 1) return { error: 'La fecha inicial debe ser anterior o igual a la final.' };
  if (dias > MAXIMO_DIAS) return { error: 'El periodo puede abarcar como máximo un año.' };
  // Periodo anterior del mismo largo, para comparar.
  const anterior = { desde: fechaISO(aMs(desde) - dias * DIA), hasta: fechaISO(aMs(desde) - DIA) };
  return { desde, hasta, dias, anterior };
}

// ---------------------------------------------------------------- Cálculo (sin base de datos)

const pct = (parte, total) => (total ? (parte / total) * 100 : null);
const promedio = (lista) => (lista.length ? lista.reduce((t, v) => t + v, 0) / lista.length : null);

// Situación de un caso respecto de sus plazos hábiles en este momento.
function cumplimiento(caso, ahora) {
  const venceContacto = sumarMinutosHabiles(caso.creado, caso.minutosContacto);
  const venceCierre = sumarMinutosHabiles(caso.creado, caso.horasCierre * 60);
  const contactado = caso.contactado ? new Date(caso.contactado) : null;
  const cerrado = caso.cerrado ? new Date(caso.cerrado) : null;
  const contactoTarde = contactado ? contactado > venceContacto : ahora > venceContacto;
  const cierreTarde = cerrado ? cerrado > venceCierre : ahora > venceCierre;
  let estado = 'en_curso';
  if (contactoTarde || cierreTarde) estado = 'vencido';
  else if (cerrado) estado = 'en_plazo';
  return {
    estado,
    contactoEvaluable: Boolean(contactado) || ahora > venceContacto,
    contactoATiempo: Boolean(contactado) && !contactoTarde,
    tiempoContacto: contactado ? minutosHabilesEntre(caso.creado, contactado) : null,
  };
}

// Agrupación de la tendencia: por día hasta dos semanas, por semana hasta cuatro meses, si no por mes.
// Cada semana se rotula con su lunes, o con el primer día del periodo si este empieza a media semana.
function grupo(fecha, dias, desde) {
  const local = new Date(new Date(fecha).getTime() + DESFASE);
  const y = local.getUTCFullYear(); const m = local.getUTCMonth(); const d = local.getUTCDate();
  if (dias <= 14) return { clave: fechaISO(Date.UTC(y, m, d)), etiqueta: `${d} ${MESES[m]}` };
  if (dias <= 120) {
    const lunes = Date.UTC(y, m, d) - ((local.getUTCDay() + 6) % 7) * DIA;
    const rotulo = new Date(desde ? Math.max(lunes, aMs(desde)) : lunes);
    return { clave: fechaISO(lunes), etiqueta: `${rotulo.getUTCDate()} ${MESES[rotulo.getUTCMonth()]}` };
  }
  return { clave: `${y}-${String(m + 1).padStart(2, '0')}`, etiqueta: `${MESES[m]} ${y}` };
}

function resumir({ respuestas, anteriores = [], cotizaciones = { cantidad: 0, monto: 0 }, casos = [], dias = 30, desde = null, ahora = new Date() }) {
  const n = respuestas.length;
  const satisfechos = respuestas.filter((r) => r.calificacion >= 4).length;
  const insatisfechos = respuestas.filter((r) => r.calificacion <= 2);
  const sinCompra = respuestas.filter((r) => !r.compro);
  const montoRespondido = respuestas.reduce((t, r) => t + r.monto, 0);
  const montoInsatisfecho = insatisfechos.reduce((t, r) => t + r.monto, 0);

  // Comparación con el periodo anterior, en puntos porcentuales.
  const nA = anteriores.length;
  const satA = pct(anteriores.filter((r) => r.calificacion >= 4).length, nA);
  const insA = pct(anteriores.filter((r) => r.calificacion <= 2).length, nA);
  const sat = pct(satisfechos, n);
  const ins = pct(insatisfechos.length, n);

  // Ingreso expuesto: lo cotizado a clientes insatisfechos o que no compraron.
  const expuestas = respuestas.filter((r) => r.calificacion <= 2 || !r.compro);
  const expuesto = (seg) => expuestas.filter((r) => !seg || r.segmento === seg).reduce((t, r) => t + r.monto, 0);

  // Motivos de no compra: cuántas veces y cuánto dinero cotizado no se vendió por cada uno.
  const motivos = new Map();
  for (const r of sinCompra) {
    const m = r.motivo || 'Sin motivo indicado';
    const actual = motivos.get(m) || { motivo: m, cantidad: 0, monto: 0 };
    actual.cantidad += 1;
    actual.monto += r.monto;
    motivos.set(m, actual);
  }

  // Satisfacción y compra: tasa de compra en cada nivel de la escala.
  const compraPorNota = [1, 2, 3, 4, 5].map((k) => {
    const delNivel = respuestas.filter((r) => r.calificacion === k);
    return { calificacion: k, respuestas: delNivel.length, tasa: pct(delNivel.filter((r) => r.compro).length, delNivel.length) };
  });

  // Comparación entre segmentos.
  const segmentos = ['minorista', 'mayorista'].map((segmento) => {
    const del = respuestas.filter((r) => r.segmento === segmento);
    return {
      segmento,
      respuestas: del.length,
      satisfechos: pct(del.filter((r) => r.calificacion >= 4).length, del.length),
      insatisfechos: pct(del.filter((r) => r.calificacion <= 2).length, del.length),
      tasaCompra: pct(del.filter((r) => r.compro).length, del.length),
      montoPromedio: del.length ? del.reduce((t, r) => t + r.monto, 0) / del.length : null,
      expuesto: expuesto(segmento),
    };
  });

  // Horario: respuestas por día de la semana (lunes a sábado) y hora de Guatemala.
  const HORAS = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18];
  const horario = Array.from({ length: 6 }, () => HORAS.map(() => ({ respuestas: 0, satisfechos: 0 })));
  for (const r of respuestas) {
    const local = new Date(new Date(r.fecha).getTime() + DESFASE);
    const dia = (local.getUTCDay() + 6) % 7; // lunes = 0
    const hora = Math.min(Math.max(local.getUTCHours(), HORAS[0]), HORAS[HORAS.length - 1]);
    if (dia > 5) continue; // domingo no se atiende
    const celda = horario[dia][hora - HORAS[0]];
    celda.respuestas += 1;
    if (r.calificacion >= 4) celda.satisfechos += 1;
  }

  // Voz del cliente: los comentarios escritos más recientes (el cliente va por código, RS10).
  const comentarios = respuestas.filter((r) => r.comentario && r.comentario.trim())
    .sort((a, b) => new Date(b.fecha) - new Date(a.fecha)).slice(0, 8)
    .map((r) => ({ fecha: r.fecha, calificacion: r.calificacion, compro: r.compro, comentario: r.comentario.trim(),
      codigoCliente: r.codigoCliente, segmento: r.segmento, vendedor: r.vendedor }));

  // Tendencia: porcentaje de clientes satisfechos por día, semana o mes.
  const grupos = new Map();
  for (const r of [...respuestas].sort((a, b) => new Date(a.fecha) - new Date(b.fecha))) {
    const g = grupo(r.fecha, dias, desde);
    const actual = grupos.get(g.clave) || { etiqueta: g.etiqueta, respuestas: 0, satisfechos: 0 };
    actual.respuestas += 1;
    if (r.calificacion >= 4) actual.satisfechos += 1;
    grupos.set(g.clave, actual);
  }

  // Casos y tiempo de primer contacto.
  const evaluados = casos.map((c) => ({ ...c, ...cumplimiento(c, ahora) }));
  const enPlazo = evaluados.filter((c) => c.estado === 'en_plazo').length;
  const vencidos = evaluados.filter((c) => c.estado === 'vencido').length;
  const contacto = ['minorista', 'mayorista'].map((segmento) => {
    const delSegmento = evaluados.filter((c) => c.segmento === segmento);
    const evaluables = delSegmento.filter((c) => c.contactoEvaluable);
    const tiempos = delSegmento.filter((c) => c.tiempoContacto !== null).map((c) => c.tiempoContacto);
    return {
      segmento,
      casos: delSegmento.length,
      plazoMinutos: delSegmento[0]?.minutosContacto ?? (segmento === 'minorista' ? 180 : 30),
      promedioMinutos: tiempos.length ? Math.round(promedio(tiempos)) : null,
      enPlazo: pct(evaluables.filter((c) => c.contactoATiempo).length, evaluables.length),
    };
  });

  // Resultados por vendedor.
  const porVendedor = new Map();
  for (const r of respuestas) {
    const v = porVendedor.get(r.idVendedor) || { id: r.idVendedor, nombre: r.vendedor, notas: [], compraron: 0, casos: 0, enPlazo: 0, evaluados: 0, leidas: 0, cerrados: 0, coaching: 0 };
    v.notas.push(r.calificacion);
    if (r.compro) v.compraron += 1;
    if (r.leida) v.leidas += 1;
    if (r.casoCerrado) v.cerrados += 1;
    if (r.casoCerrado && r.coaching) v.coaching += 1;
    porVendedor.set(r.idVendedor, v);
  }
  for (const c of evaluados) {
    const v = porVendedor.get(c.idVendedor);
    if (!v) continue;
    v.casos += 1;
    if (c.estado !== 'en_curso') v.evaluados += 1;
    if (c.estado === 'en_plazo') v.enPlazo += 1;
  }
  const vendedores = [...porVendedor.values()].map((v) => ({
    id: v.id,
    nombre: v.nombre,
    respuestas: v.notas.length,
    promedio: promedio(v.notas),
    satisfechos: pct(v.notas.filter((x) => x >= 4).length, v.notas.length),
    insatisfechos: pct(v.notas.filter((x) => x <= 2).length, v.notas.length),
    tasaCompra: pct(v.compraron, v.notas.length),
    casos: v.casos,
    enPlazo: pct(v.enPlazo, v.evaluados),
    leidas: pct(v.leidas, v.notas.length),
    casosCerrados: v.cerrados,
    coaching: v.coaching,
  })).sort((a, b) => b.satisfechos - a.satisfechos || b.respuestas - a.respuestas);

  return {
    respuestas: n,
    cotizaciones: cotizaciones.cantidad,
    tasaRespuesta: pct(n, cotizaciones.cantidad),
    promedio: promedio(respuestas.map((r) => r.calificacion)),
    satisfechos: sat,
    insatisfechos: ins,
    insatisfaccionPonderada: pct(montoInsatisfecho, montoRespondido),
    comparacion: nA ? {
      respuestas: nA,
      satisfechos: sat === null ? null : sat - satA,
      insatisfechos: ins === null ? null : ins - insA,
    } : null,
    reparto: [1, 2, 3, 4, 5].map((k) => respuestas.filter((r) => r.calificacion === k).length),
    compra: { compraron: n - sinCompra.length, sinCompra: sinCompra.length, tasa: pct(n - sinCompra.length, n) },
    motivos: [...motivos.values()].sort((a, b) => b.cantidad - a.cantidad || b.monto - a.monto),
    compraPorNota,
    segmentos,
    horario: { horas: HORAS, dias: ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'], celdas: horario },
    comentarios,
    expuesto: {
      total: expuesto(),
      mayorista: expuesto('mayorista'),
      minorista: expuesto('minorista'),
      totalCotizado: cotizaciones.monto,
      porcentaje: pct(expuesto(), cotizaciones.monto),
    },
    casos: { total: casos.length, enPlazo, vencidos, enCurso: casos.length - enPlazo - vencidos, porcentaje: pct(enPlazo, enPlazo + vencidos) },
    contacto,
    vendedores,
    tendencia: [...grupos.values()].map((g) => ({ etiqueta: g.etiqueta, respuestas: g.respuestas, valor: pct(g.satisfechos, g.respuestas) })),
  };
}

// ---------------------------------------------------------------- Consultas

const INICIO = (p) => `(${p}::date::timestamp AT TIME ZONE 'America/Guatemala')`;
const FIN = (p) => `((${p}::date + 1)::timestamp AT TIME ZONE 'America/Guatemala')`;

// Condiciones comunes sobre la cotización (c), su cliente (e) y su vendedor (v).
function filtros({ usuario, tipo, segmento, idVendedor, incluirPruebas }, valores) {
  const agregar = (v) => { valores.push(v); return `$${valores.length}`; };
  const condiciones = ["c.estado <> 'anulada'"];
  if (!incluirPruebas) condiciones.push('NOT c.es_prueba');
  if (tipo === 'propio') condiciones.push(`c.id_vendedor = ${agregar(usuario.id_usuario)}::int`);
  if (tipo === 'equipo') condiciones.push(`v.id_supervisor = ${agregar(usuario.id_usuario)}::int`);
  if (idVendedor && tipo !== 'propio') condiciones.push(`c.id_vendedor = ${agregar(idVendedor)}::int`);
  if (segmento) condiciones.push(`e.segmento = ${agregar(segmento)}::text`);
  return { condiciones, agregar };
}

const ORIGEN = `FROM cotizacion c
  JOIN empresa_cliente e ON e.id_cliente = c.id_cliente
  JOIN usuario v ON v.id_usuario = c.id_vendedor`;

async function respuestasDel(opciones, desde, hasta) {
  const valores = [];
  const { condiciones, agregar } = filtros(opciones, valores);
  const d = agregar(desde); const h = agregar(hasta);
  const { rows } = await consulta(`
    SELECT r.calificacion, r.concreto_compra AS compro, mo.descripcion AS motivo, c.monto_cotizado::float AS monto,
           e.segmento, e.codigo AS "codigoCliente", c.id_vendedor AS "idVendedor", v.nombres || ' ' || v.apellidos AS vendedor,
           r.fecha_hora_captura AS fecha, r.comentario,
           (a.id_acuse IS NOT NULL) AS leida, (cs.estado = 'cerrado') AS "casoCerrado",
           EXISTS (SELECT 1 FROM bitacora_auditoria b WHERE b.accion = 'confirmacion_coaching'
                    AND b.entidad = 'encuesta_respuesta' AND b.id_registro_afectado = r.id_respuesta) AS coaching
      ${ORIGEN}
      JOIN encuesta_respuesta r ON r.id_cotizacion = c.id_cotizacion
      LEFT JOIN motivo_no_compra mo ON mo.id_motivo = r.id_motivo
      LEFT JOIN acuse_retroalimentacion a ON a.id_respuesta = r.id_respuesta
      LEFT JOIN caso_servicio cs ON cs.id_respuesta = r.id_respuesta
     WHERE ${condiciones.join(' AND ')}
       AND r.fecha_hora_captura >= ${INICIO(d)} AND r.fecha_hora_captura < ${FIN(h)}`, valores);
  return rows;
}

async function cotizacionesDel(opciones, desde, hasta) {
  const valores = [];
  const { condiciones, agregar } = filtros(opciones, valores);
  const d = agregar(desde); const h = agregar(hasta);
  const { rows: [fila] } = await consulta(`
    SELECT count(*)::int AS cantidad, COALESCE(sum(c.monto_cotizado), 0)::float AS monto
      ${ORIGEN}
     WHERE ${condiciones.join(' AND ')} AND c.fecha_hora >= ${INICIO(d)} AND c.fecha_hora < ${FIN(h)}`, valores);
  return fila;
}

async function casosDel(opciones, desde, hasta) {
  const valores = [];
  const { condiciones, agregar } = filtros(opciones, valores);
  const d = agregar(desde); const h = agregar(hasta);
  const { rows } = await consulta(`
    SELECT cs.fecha_hora_creacion AS creado, cs.fecha_hora_primer_contacto AS contactado, cs.fecha_hora_cierre AS cerrado,
           pl.minutos_primer_contacto AS "minutosContacto", pl.horas_cierre AS "horasCierre",
           e.segmento, c.id_vendedor AS "idVendedor"
      ${ORIGEN}
      JOIN encuesta_respuesta r ON r.id_cotizacion = c.id_cotizacion
      JOIN caso_servicio cs ON cs.id_respuesta = r.id_respuesta
      JOIN plazo_atencion pl ON pl.id_plazo = cs.id_plazo
     WHERE ${condiciones.join(' AND ')}
       AND cs.fecha_hora_creacion >= ${INICIO(d)} AND cs.fecha_hora_creacion < ${FIN(h)}`, valores);
  return rows;
}

// Vendedores que el perfil puede elegir en el filtro.
async function vendedoresVisibles(usuario, tipo) {
  if (tipo === 'propio') return [];
  const valores = [];
  let condicion = '';
  if (tipo === 'equipo') { valores.push(usuario.id_usuario); condicion = 'AND u.id_supervisor = $1::int'; }
  const { rows } = await consulta(`
    SELECT u.id_usuario AS id, u.nombres || ' ' || u.apellidos AS nombre, u.activo
      FROM usuario u JOIN perfil p ON p.id_perfil = u.id_perfil
     WHERE p.nombre = 'vendedor' ${condicion}
     ORDER BY (u.correo LIKE '%@pruebas.tylsefa.com'), u.activo DESC, u.nombres, u.apellidos`, valores);
  return rows;
}

async function calcular(usuario, { periodo, segmento = '', idVendedor = null, incluirPruebas = false }, ahora = new Date()) {
  const tipo = alcance(usuario);
  const opciones = { usuario, tipo, segmento, idVendedor, incluirPruebas };
  const [respuestas, anteriores, cotizaciones, casos] = await Promise.all([
    respuestasDel(opciones, periodo.desde, periodo.hasta),
    respuestasDel(opciones, periodo.anterior.desde, periodo.anterior.hasta),
    cotizacionesDel(opciones, periodo.desde, periodo.hasta),
    casosDel(opciones, periodo.desde, periodo.hasta),
  ]);
  return resumir({ respuestas, anteriores, cotizaciones, casos, dias: periodo.dias, desde: periodo.desde, ahora });
}

module.exports = { alcance, validarPeriodo, resumir, calcular, vendedoresVisibles, cumplimiento };
