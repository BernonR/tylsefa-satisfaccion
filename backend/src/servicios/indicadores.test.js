'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { validarPeriodo, resumir, cumplimiento, alcance } = require('./indicadores');

const gt = (texto) => new Date(`${texto}-06:00`);
const respuesta = (calificacion, compro, monto, extra = {}) => ({
  calificacion, compro, monto, segmento: 'minorista', idVendedor: 1, vendedor: 'Vendedor Uno',
  fecha: gt('2026-10-14T10:00:00'), motivo: compro ? null : 'El precio no se ajustó a lo esperado', ...extra,
});

test('CP-U23 el periodo por defecto es el mes en curso y se compara con uno del mismo largo', () => {
  const p = validarPeriodo({}, gt('2026-10-14T23:30:00'));
  assert.deepEqual([p.desde, p.hasta, p.dias], ['2026-10-01', '2026-10-31', 31]);
  assert.deepEqual(p.anterior, { desde: '2026-08-31', hasta: '2026-09-30' });
  // A las 23:30 del 31 de octubre en Guatemala ya es 1 de noviembre en UTC: sigue siendo octubre.
  assert.equal(validarPeriodo({}, gt('2026-10-31T23:30:00')).desde, '2026-10-01');
  assert.deepEqual(validarPeriodo({ desde: '2026-10-14', hasta: '2026-10-14' }).anterior, { desde: '2026-10-13', hasta: '2026-10-13' });
  assert.ok(validarPeriodo({ desde: '2026-10-20', hasta: '2026-10-01' }).error, 'fechas invertidas');
  assert.ok(validarPeriodo({ desde: '2026-02-30', hasta: '2026-03-01' }).error, 'fecha inexistente');
  assert.ok(validarPeriodo({ desde: '2025-01-01', hasta: '2026-10-01' }).error, 'más de un año');
});

test('CP-U24 los indicadores siguen la definición del reporte aprobado', () => {
  const r = resumir({
    respuestas: [
      respuesta(5, true, 10000), respuesta(4, true, 10000), respuesta(3, false, 5000),
      respuesta(2, false, 25000, { segmento: 'mayorista' }), respuesta(1, true, 50000, { segmento: 'mayorista' }),
    ],
    anteriores: [respuesta(5, true, 1), respuesta(1, false, 1)],
    cotizaciones: { cantidad: 8, monto: 200000 },
  });
  assert.equal(r.respuestas, 5);
  assert.equal(r.tasaRespuesta, 62.5);
  assert.equal(r.promedio, 3);
  assert.equal(r.satisfechos, 40);
  assert.equal(r.insatisfechos, 40);
  assert.equal(r.insatisfaccionPonderada, 75, 'Q75,000 insatisfechos de Q100,000 respondidos');
  assert.deepEqual(r.comparacion, { respuestas: 2, satisfechos: -10, insatisfechos: -10 });
  assert.deepEqual(r.reparto, [1, 1, 1, 1, 1]);
  assert.deepEqual(r.compra, { compraron: 3, sinCompra: 2, tasa: 60 });
  // Expuesto: insatisfechos (1 y 2) o que no compraron (el 3): 5,000 + 25,000 + 50,000.
  assert.deepEqual([r.expuesto.total, r.expuesto.mayorista, r.expuesto.minorista, r.expuesto.porcentaje], [80000, 75000, 5000, 40]);
  assert.deepEqual(r.motivos, [{ motivo: 'El precio no se ajustó a lo esperado', cantidad: 2, monto: 30000 }], 'monto que no se vendió');
  assert.deepEqual(r.compraPorNota.map((x) => x.tasa), [100, 0, 0, 100, 100]);
  const [mino, mayo] = r.segmentos;
  assert.deepEqual([mino.respuestas, Math.round(mino.satisfechos), Math.round(mino.tasaCompra), Math.round(mino.montoPromedio)], [3, 67, 67, 8333]);
  assert.deepEqual([mayo.respuestas, mayo.insatisfechos, mayo.expuesto], [2, 100, 75000]);
  // Las cinco respuestas fueron el miércoles a las 10:00 (fila 2, columna de las 10).
  assert.equal(r.horario.celdas[2][r.horario.horas.indexOf(10)].respuestas, 5);
  assert.equal(r.vendedores.length, 1);
  assert.equal(r.tendencia.length, 1);
  assert.equal(r.tendencia[0].valor, 40);
  // Sin respuestas no hay división entre cero.
  const vacio = resumir({ respuestas: [] });
  assert.equal(vacio.satisfechos, null);
  assert.equal(vacio.comparacion, null);
});

test('CP-U25 un caso cuenta en plazo solo si se contactó y cerró dentro de los plazos hábiles', () => {
  const caso = (contactado, cerrado) => ({ creado: gt('2026-10-14T09:00:00'), contactado, cerrado, minutosContacto: 180, horasCierre: 48 });
  const ahora = gt('2026-10-14T11:00:00');
  assert.equal(cumplimiento(caso(gt('2026-10-14T10:00:00'), gt('2026-10-14T15:00:00')), ahora).estado, 'en_plazo');
  assert.equal(cumplimiento(caso(gt('2026-10-14T10:00:00'), null), ahora).estado, 'en_curso');
  assert.equal(cumplimiento(caso(null, null), gt('2026-10-14T12:30:00')).estado, 'vencido', 'pasaron las 3 horas sin contacto');
  assert.equal(cumplimiento(caso(gt('2026-10-14T13:00:00'), gt('2026-10-14T15:00:00')), ahora).estado, 'vencido', 'contacto tardío');
  assert.equal(cumplimiento(caso(gt('2026-10-14T09:45:00'), null), ahora).tiempoContacto, 45);
});

test('CP-U26 el alcance del tablero lo fija el permiso más amplio del perfil', () => {
  assert.equal(alcance({ permisos: ['tablero.propio'] }), 'propio');
  assert.equal(alcance({ permisos: ['tablero.equipo', 'caso.atender'] }), 'equipo');
  assert.equal(alcance({ permisos: ['tablero.sucursal', 'reporte.exportar'] }), 'sucursal');
  assert.equal(alcance({ permisos: ['usuarios.administrar'] }), null);
});

test('CP-U27 la voz del cliente muestra los comentarios recientes y la retroalimentación leída por vendedor', () => {
  const r = resumir({
    respuestas: [
      respuesta(2, false, 1000, { comentario: 'Tardaron en atender', codigoCliente: 'CLI-0007', leida: true, casoCerrado: true, coaching: true }),
      respuesta(5, true, 1000, { comentario: '  ', leida: false, fecha: gt('2026-10-15T09:00:00') }),
      respuesta(4, true, 1000, { comentario: 'Muy buena atención', codigoCliente: 'CLI-0009', leida: true, fecha: gt('2026-10-16T09:00:00') }),
    ],
  });
  assert.deepEqual(r.comentarios.map((c) => c.codigoCliente), ['CLI-0009', 'CLI-0007'], 'sin comentarios vacíos, el más reciente primero');
  const [v] = r.vendedores;
  assert.equal(Math.round(v.leidas), 67);
  assert.deepEqual([v.casosCerrados, v.coaching], [1, 1]);
});
