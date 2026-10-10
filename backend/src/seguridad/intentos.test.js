'use strict';
// Pruebas unitarias: freno de intentos fallidos de inicio de sesión.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { crearFreno } = require('./intentos');

test('CP-U09 tras 5 fallos se bloquea y a los 15 minutos se libera', () => {
  const freno = crearFreno();
  const t = 1_000_000;
  for (let i = 0; i < 5; i++) freno.fallo('1.1.1.1', 'a@b.com', t);
  assert.equal(freno.bloqueado('1.1.1.1', 'A@B.com', t), true);
  assert.equal(freno.bloqueado('2.2.2.2', 'a@b.com', t), false);
  assert.equal(freno.bloqueado('1.1.1.1', 'a@b.com', t + 15 * 60_000 + 1), false);
});
