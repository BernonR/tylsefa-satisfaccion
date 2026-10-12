'use strict';
// Pruebas unitarias: reglas de los catálogos de personal y empresas cliente (M02).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validarUsuario, validarCliente, validarCotizacion, validarMotivo, identificador } = require('./validacion');

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

test('CP-U15 el número de cotización acepta los 6 dígitos o el formato completo COT-000000', () => {
  const base = { monto: '12,480.50', idVendedor: 3, idCliente: 9 };
  assert.equal(validarCotizacion({ ...base, numero: '004517' }).limpio.numero, 'COT-004517');
  assert.equal(validarCotizacion({ ...base, numero: 'cot-004517' }).valido, true);
  assert.ok(validarCotizacion({ ...base, numero: '4517' }).errores.numero);
  assert.ok(validarCotizacion({ ...base, numero: 'COT-00451A' }).errores.numero);
  assert.equal(validarCotizacion({ ...base, numero: '004517' }).limpio.monto, 12480.5);
});

test('CP-U16 el monto debe ser mayor que cero y la anulación exige motivo', () => {
  const base = { numero: '004517', idVendedor: 3, idCliente: 9 };
  assert.ok(validarCotizacion({ ...base, monto: '0' }).errores.monto);
  assert.ok(validarCotizacion({ ...base, monto: '-5' }).errores.monto);
  assert.ok(validarCotizacion({ ...base, monto: 'abc' }).errores.monto);
  assert.ok(validarMotivo('mal').error);
  assert.equal(validarMotivo('  Cliente pidió otra cotización  ').motivo, 'Cliente pidió otra cotización');
});
