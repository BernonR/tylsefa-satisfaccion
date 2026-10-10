'use strict';
// Pruebas unitarias: comprobante de sesión y su vencimiento por inactividad (RS11).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { crearComprobante, leerComprobante, leerCookies, cookieSesion } = require('./sesion');

const config = { secreto: 'secreto-de-prueba', minutos: 15, nombreCookie: 'tylsefa_sesion', segura: true };
const AHORA = Date.UTC(2026, 9, 10, 15, 0, 0);

test('CP-U05 un comprobante recién creado es válido', () => {
  const c = crearComprobante(7, config, AHORA);
  assert.equal(leerComprobante(c, config, AHORA + 60_000).sub, 7);
});

test('CP-U06 el servidor rechaza el comprobante tras 15 minutos sin actividad', () => {
  const c = crearComprobante(7, config, AHORA);
  assert.ok(leerComprobante(c, config, AHORA + 14 * 60_000));
  assert.equal(leerComprobante(c, config, AHORA + 15 * 60_000), null);
});

test('CP-U07 un comprobante alterado o firmado con otro secreto se rechaza', () => {
  const c = crearComprobante(7, config, AHORA);
  const [contenido, firma] = c.split('.');
  const otro = Buffer.from(JSON.stringify({ sub: 1, exp: AHORA + 999_999 })).toString('base64url');
  assert.equal(leerComprobante(`${otro}.${firma}`, config, AHORA), null);
  assert.equal(leerComprobante(c, { ...config, secreto: 'otro' }, AHORA), null);
  assert.equal(leerComprobante('basura', config, AHORA), null);
  assert.ok(contenido);
});

test('CP-U08 la cookie es HttpOnly, SameSite y segura', () => {
  const cookie = cookieSesion('abc', config);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /Max-Age=1020/);
  assert.deepEqual(leerCookies('a=1; tylsefa_sesion=abc'), { a: '1', tylsefa_sesion: 'abc' });
});

test('CP-U10 el cierre por inactividad se acepta poco después del vencimiento, pero no el acceso', () => {
  const c = crearComprobante(7, config, AHORA);
  const vencido = AHORA + 15 * 60_000 + 30_000;
  assert.equal(leerComprobante(c, config, vencido), null);
  assert.equal(leerComprobante(c, config, vencido, 120_000).sub, 7);
  assert.equal(leerComprobante(c, config, AHORA + 18 * 60_000, 120_000), null);
});
