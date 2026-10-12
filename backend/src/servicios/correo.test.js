'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { omitido, plantilla, enviar } = require('./correo');

test('CP-U22 nunca se escribe a las direcciones inventadas de los datos de prueba', async () => {
  assert.equal(omitido('compras@prueba.tylsefa.com'), true);
  assert.equal(omitido('supervisor@pruebas.tylsefa.com'), true);
  assert.equal(omitido(''), true);
  assert.equal(omitido('luis.alonso@tylsefa.com'), false);
  assert.equal(await enviar({ para: 'compras@prueba.tylsefa.com', asunto: 'x', html: 'x' }), 'pendiente');
  const { html, texto } = plantilla({ titulo: 'Caso <b>CASO-000001</b>', filas: [['Cliente', 'A & B']] });
  assert.ok(html.includes('Caso &lt;b&gt;CASO-000001&lt;/b&gt;'), 'el contenido se escapa');
  assert.ok(html.includes('A &amp; B'));
  assert.ok(texto.includes('Cliente: A & B'));
});
