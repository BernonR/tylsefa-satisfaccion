'use strict';

// M03 · Cotizaciones (CU-04): el supervisor registra, corrige mientras esté pendiente y anula con motivo.
// El vendedor consulta solo las suyas; supervisor y gerente consultan todas.

const express = require('express');
const { exigirSesion, exigirPermiso } = require('../middleware/autenticacion');
const { validarCotizacion, validarMotivo, identificador } = require('../servicios/validacion');
const cotizaciones = require('../servicios/cotizaciones');
const bitacora = require('../servicios/bitacora');

const rutas = express.Router();
rutas.use(exigirSesion);
const consultar = exigirPermiso('cotizacion.consultar', 'cotizacion.registrar');
const registrar = exigirPermiso('cotizacion.registrar');
const invalido = (res, errores) => res.status(400).json({ mensaje: 'Revise los datos marcados.', errores });
const formato = (n) => new Intl.NumberFormat('es-GT', { style: 'currency', currency: 'GTQ' }).format(n);

// El vendedor solo ve las cotizaciones en las que él atendió.
const soloPropias = (usuario) => usuario.perfil === 'vendedor';

async function revisarReglas(limpio, idSupervisor, excepto) {
  const errores = {};
  if (limpio.numero && await cotizaciones.numeroEnUso(limpio.numero, excepto)) errores.numero = 'Ese número de cotización ya está registrado.';
  if (Number.isInteger(limpio.idVendedor) && limpio.idVendedor > 0) {
    if (!(await cotizaciones.vendedorActivo(limpio.idVendedor))) errores.idVendedor = 'El vendedor elegido no existe o está desactivado.';
    else if (limpio.idVendedor === idSupervisor) errores.idVendedor = 'Quien atiende no puede registrar su propia cotización.';
  }
  if (Number.isInteger(limpio.idCliente) && limpio.idCliente > 0 && !(await cotizaciones.clienteActivo(limpio.idCliente))) {
    errores.idCliente = 'La empresa elegida no existe o está desactivada.';
  }
  return errores;
}

rutas.get('/', consultar, async (req, res) => {
  const texto = (v) => (typeof v === 'string' ? v.trim().slice(0, 60) : '');
  const dias = [1, 7, 30, 90].includes(Number(req.query.dias)) ? Number(req.query.dias) : 0;
  const lista = await cotizaciones.listar({
    buscar: texto(req.query.buscar),
    estado: texto(req.query.estado),
    dias,
    idVendedor: soloPropias(req.usuario) ? req.usuario.id_usuario : null,
  });
  res.json({ cotizaciones: lista, diasVigencia: cotizaciones.DIAS_VIGENCIA });
});

rutas.get('/opciones', registrar, async (req, res) => {
  res.json(await cotizaciones.opciones());
});

rutas.post('/', registrar, async (req, res) => {
  const { errores, limpio } = validarCotizacion(req.body);
  const todos = { ...(await revisarReglas(limpio, req.usuario.id_usuario, null)), ...errores };
  if (Object.keys(todos).length) return invalido(res, todos);
  const id = await cotizaciones.crear(limpio, req.usuario.id_usuario);
  await bitacora.registrar({
    idUsuario: req.usuario.id_usuario, accion: 'registro_cotizacion', entidad: 'cotizacion', idRegistro: id,
    detalle: `${limpio.numero} por ${formato(limpio.monto)}${limpio.esPrueba ? ' (prueba)' : ''}`,
  });
  res.status(201).json({ id, mensaje: `Cotización ${limpio.numero} registrada. El cliente ya puede calificar en la terminal.` });
});

rutas.put('/:id', registrar, async (req, res) => {
  const id = identificador(req.params.id);
  const actual = id && await cotizaciones.obtener(id);
  if (!actual) return res.status(404).json({ mensaje: 'No se encontró la cotización.' });
  if (actual.estado !== 'pendiente') return res.status(409).json({ mensaje: 'Solo se puede corregir una cotización pendiente.' });
  const { errores, limpio } = validarCotizacion(req.body);
  const todos = { ...(await revisarReglas(limpio, req.usuario.id_usuario, id)), ...errores };
  if (Object.keys(todos).length) return invalido(res, todos);
  if (!(await cotizaciones.corregir(id, limpio))) return res.status(409).json({ mensaje: 'La cotización ya no está pendiente.' });
  await bitacora.registrar({
    idUsuario: req.usuario.id_usuario, accion: 'correccion_cotizacion', entidad: 'cotizacion', idRegistro: id,
    detalle: `${actual.numero} → ${limpio.numero}; monto ${formato(actual.monto)} → ${formato(limpio.monto)}`,
  });
  res.json({ mensaje: 'Cotización corregida.' });
});

rutas.post('/:id/anular', registrar, async (req, res) => {
  const id = identificador(req.params.id);
  const actual = id && await cotizaciones.obtener(id);
  if (!actual) return res.status(404).json({ mensaje: 'No se encontró la cotización.' });
  const { motivo, error } = validarMotivo(req.body?.motivo);
  if (error) return invalido(res, { motivo: error });
  if (!(await cotizaciones.anular(id, motivo))) return res.status(409).json({ mensaje: 'Solo se puede anular una cotización pendiente.' });
  await bitacora.registrar({
    idUsuario: req.usuario.id_usuario, accion: 'anulacion_cotizacion', entidad: 'cotizacion', idRegistro: id,
    detalle: `${actual.numero}: ${motivo}`,
  });
  res.json({ mensaje: `Cotización ${actual.numero} anulada. Ya no se acepta en la terminal.` });
});

module.exports = rutas;
