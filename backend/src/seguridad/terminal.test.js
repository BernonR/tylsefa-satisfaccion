'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { crearAutorizacion, leerAutorizacion, cookieTerminal } = require('./terminal');
const { crearComprobante, leerComprobante } = require('./sesion');

const cfg = { secreto: 'secreto-de-prueba', dias: 90, nombreCookie: 'tylsefa_terminal', segura: true, minutos: 15 };

test('CP-U17 la autorización de la terminal vale 90 días y no se puede alterar', () => {
  const ahora = Date.now();
  const { valor, datos } = crearAutorizacion(7, cfg, ahora);
  assert.equal(leerAutorizacion(valor, cfg, ahora).id, datos.id);
  assert.ok(leerAutorizacion(valor, cfg, ahora + 89 * 86400000));
  assert.equal(leerAutorizacion(valor, cfg, ahora + 91 * 86400000), null, 'vencida');
  const [contenido, firma] = valor.split('.');
  const otro = Buffer.from(JSON.stringify({ ...datos, exp: ahora + 999 * 86400000 })).toString('base64url');
  assert.equal(leerAutorizacion(`${otro}.${firma}`, cfg, ahora), null, 'alterada');
  assert.equal(leerAutorizacion(`${contenido}.${firma}`, { secreto: 'otro' }, ahora), null, 'otro secreto');
  assert.match(cookieTerminal(valor, cfg), /Path=\/api\/terminal; HttpOnly; SameSite=Lax; Max-Age=7776000; Secure/);
});

test('CP-U18 la terminal y la sesión del personal no se sustituyen entre sí', () => {
  const ahora = Date.now();
  const sesion = crearComprobante(7, cfg, ahora);
  assert.equal(leerAutorizacion(sesion, cfg, ahora), null, 'la sesión no sirve como terminal');
  const { valor } = crearAutorizacion(7, cfg, ahora);
  assert.equal(leerComprobante(valor, cfg, ahora), null, 'la terminal no abre el panel');
});
