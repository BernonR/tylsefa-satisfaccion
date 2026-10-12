'use strict';

// Catálogo de empresas cliente (M02): el administrador gestiona; supervisor y gerente consultan.

const express = require('express');
const { exigirSesion, exigirPermiso } = require('../middleware/autenticacion');
const { validarCliente, identificador } = require('../servicios/validacion');
const clientes = require('../servicios/clientes');
const bitacora = require('../servicios/bitacora');

const rutas = express.Router();
rutas.use(exigirSesion);
const consultar = exigirPermiso('catalogos.consultar', 'catalogos.gestionar');
const gestionar = exigirPermiso('catalogos.gestionar');

const invalido = (res, errores) => res.status(400).json({ mensaje: 'Revise los datos marcados.', errores });
const noEncontrado = (res) => res.status(404).json({ mensaje: 'No se encontró la empresa cliente.' });

rutas.get('/', consultar, async (req, res) => {
  const texto = (v) => (typeof v === 'string' ? v.trim().slice(0, 80) : '');
  res.json({
    clientes: await clientes.listar({ buscar: texto(req.query.buscar), segmento: texto(req.query.segmento), estado: texto(req.query.estado) || 'activos' }),
  });
});

rutas.post('/', gestionar, async (req, res) => {
  const { errores, limpio, valido } = validarCliente(req.body);
  if (!valido) return invalido(res, errores);
  const cliente = await clientes.crear(limpio);
  await bitacora.registrar({
    idUsuario: req.usuario.id_usuario, accion: 'alta_cliente', entidad: 'empresa_cliente', idRegistro: cliente.id,
    detalle: `${cliente.codigo} ${cliente.nombre} (${cliente.segmento})`,
  });
  res.status(201).json({ cliente, mensaje: `Empresa registrada con el código ${cliente.codigo}.` });
});

rutas.put('/:id', gestionar, async (req, res) => {
  const id = identificador(req.params.id);
  if (!id) return noEncontrado(res);
  const { errores, limpio, valido } = validarCliente(req.body);
  if (!valido) return invalido(res, errores);
  const cliente = await clientes.actualizar(id, limpio);
  if (!cliente) return noEncontrado(res);
  await bitacora.registrar({
    idUsuario: req.usuario.id_usuario, accion: 'modificacion_cliente', entidad: 'empresa_cliente', idRegistro: id,
    detalle: `${cliente.codigo} ${cliente.nombre}`,
  });
  res.json({ cliente, mensaje: 'Cambios guardados.' });
});

rutas.patch('/:id/estado', gestionar, async (req, res) => {
  const id = identificador(req.params.id);
  const activo = req.body?.activo === true;
  const cliente = id && await clientes.cambiarEstado(id, activo);
  if (!cliente) return noEncontrado(res);
  await bitacora.registrar({
    idUsuario: req.usuario.id_usuario, accion: activo ? 'activar_cliente' : 'desactivar_cliente',
    entidad: 'empresa_cliente', idRegistro: id, detalle: `${cliente.codigo} ${cliente.nombre}`,
  });
  res.json({ cliente, mensaje: activo ? 'Empresa activada.' : 'Empresa desactivada. Ya no aparecerá al registrar cotizaciones.' });
});

module.exports = rutas;
