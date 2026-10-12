'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { sumarMinutosHabiles, minutosHabilesEntre } = require('./horario');

// Hora de Guatemala (UTC-6). El 14 de octubre de 2026 es miércoles.
const gt = (texto) => new Date(`${texto}-06:00`);
const iso = (fecha) => fecha.toISOString();

test('CP-U20 los plazos se cuentan en horas hábiles, de lunes a viernes de 8:00 a 17:00', () => {
  // Minorista: 3 horas para el primer contacto.
  assert.equal(iso(sumarMinutosHabiles(gt('2026-10-14T09:00:00'), 180)), iso(gt('2026-10-14T12:00:00')));
  assert.equal(iso(sumarMinutosHabiles(gt('2026-10-14T16:00:00'), 180)), iso(gt('2026-10-15T10:00:00')), 'pasa al día siguiente');
  assert.equal(iso(sumarMinutosHabiles(gt('2026-10-16T16:00:00'), 180)), iso(gt('2026-10-19T10:00:00')), 'viernes → lunes');
  assert.equal(iso(sumarMinutosHabiles(gt('2026-10-17T11:00:00'), 30)), iso(gt('2026-10-19T08:30:00')), 'sábado → lunes 8:00');
  assert.equal(iso(sumarMinutosHabiles(gt('2026-10-14T06:15:00'), 30)), iso(gt('2026-10-14T08:30:00')), 'antes de abrir');
  // Mayorista: 7 horas para el cierre. Minorista: 48 horas (5 días y 3 horas hábiles).
  assert.equal(iso(sumarMinutosHabiles(gt('2026-10-14T10:00:00'), 7 * 60)), iso(gt('2026-10-14T17:00:00')));
  assert.equal(iso(sumarMinutosHabiles(gt('2026-10-14T10:00:00'), 48 * 60)), iso(gt('2026-10-21T13:00:00')));
});

test('CP-U21 el tiempo transcurrido descuenta noches y fines de semana', () => {
  assert.equal(minutosHabilesEntre(gt('2026-10-14T09:00:00'), gt('2026-10-14T09:45:00')), 45);
  assert.equal(minutosHabilesEntre(gt('2026-10-16T16:30:00'), gt('2026-10-19T08:30:00')), 60, 'viernes 16:30 → lunes 8:30');
  assert.equal(minutosHabilesEntre(gt('2026-10-17T10:00:00'), gt('2026-10-18T10:00:00')), 0, 'fin de semana');
});
