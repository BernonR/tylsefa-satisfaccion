'use strict';
// Pruebas unitarias: reglas de los catálogos de personal y empresas cliente (M02).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validarUsuario, validarCliente, identificador } = require('./validacion');

test('CP-U11 un vendedor necesita supervisor; los demás perfiles no guardan supervisor', () => {
  const base = { nombres: 'Ana', apellidos: 'López', correo: 'ana@tylsefa.com' };
  assert.ok(validarUsuario({ ...base, perfil: 'vendedor' }).errores.idSupervisor);
  assert.equal(validarUsuario({ ...base, perfil: 'vendedor', idSupervisor: 3 }).valido, true);
  assert.equal(validarUsuario({ ...base, perfil: 'gerente', idSupervisor: 3 }).limpio.idSupervisor, null);
});

test('CP-U12 el usuario nuevo exige contraseña temporal que cumpla la política', () => {
  const datos = { nombres: 'Ana', apellidos: 'López', correo: 'ANA@Tylsefa.com ', perfil: 'gerente' };
  assert.ok(validarUsuario({ ...datos, clave: 'corta' }, { nuevo: true }).errores.clave);
  const ok = validarUsuario({ ...datos, clave: 'Temporal2026' }, { nuevo: true });
  assert.equal(ok.valido, true);
  assert.equal(ok.limpio.correo, 'ana@tylsefa.com');
});

test('CP-U13 la empresa cliente exige nombre, segmento y correo; el NIT es opcional', () => {
  assert.deepEqual(Object.keys(validarCliente({}).errores).sort(), ['correo', 'nombre', 'segmento']);
  assert.equal(validarCliente({ nombre: 'Farmacia X', segmento: 'minorista', correo: 'a@b.com' }).valido, true);
  assert.ok(validarCliente({ nombre: 'X', segmento: 'minorista', correo: 'a@b.com', nit: '12 34' }).errores.nit);
  assert.equal(validarCliente({ nombre: 'X', segmento: 'mayorista', correo: 'a@b.com', nit: '1234567-k' }).limpio.nit, '1234567-K');
});

test('CP-U14 los identificadores de la dirección solo aceptan enteros positivos', () => {
  assert.equal(identificador('7'), 7);
  assert.equal(identificador('0'), null);
  assert.equal(identificador('1 OR 1=1'), null);
  assert.equal(identificador('-3'), null);
});
