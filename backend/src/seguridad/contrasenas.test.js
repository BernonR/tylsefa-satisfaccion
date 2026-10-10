'use strict';
// Pruebas unitarias: resumen de contraseñas (RS02) y política de complejidad (RS03).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { generarResumen, verificar, revisarPolitica } = require('./contrasenas');

test('CP-U01 la contraseña se guarda como resumen, nunca en texto', async () => {
  const resumen = await generarResumen('Tylsefa2026');
  assert.match(resumen, /^scrypt\$17\$8\$1\$/);
  assert.ok(!resumen.includes('Tylsefa2026'));
});

test('CP-U02 dos resúmenes de la misma contraseña son distintos (valor aleatorio)', async () => {
  assert.notEqual(await generarResumen('Tylsefa2026'), await generarResumen('Tylsefa2026'));
});

test('CP-U03 la verificación acepta la correcta y rechaza la incorrecta', async () => {
  const resumen = await generarResumen('Tylsefa2026');
  assert.equal(await verificar('Tylsefa2026', resumen), true);
  assert.equal(await verificar('tylsefa2026', resumen), false);
  assert.equal(await verificar('Tylsefa2026', 'texto-sin-formato'), false);
});

test('CP-U04 la política exige 8 caracteres, mayúscula, minúscula y número', () => {
  assert.deepEqual(revisarPolitica('Tylsefa2026'), []);
  assert.ok(revisarPolitica('corta1A').includes('al menos 8 caracteres'));
  assert.ok(revisarPolitica('sinmayuscula1').includes('una letra mayúscula'));
  assert.ok(revisarPolitica('SINMINUSCULA1').includes('una letra minúscula'));
  assert.ok(revisarPolitica('SinNumeroAqui').includes('un número'));
});
