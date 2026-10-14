'use strict';

// M06 · Tablero de indicadores (RF13). El alcance lo fija el perfil (RS04): el vendedor ve
// sus interacciones, el supervisor las de su equipo y la gerencia toda la sucursal.

const express = require('express');
const { exigirSesion, exigirPermiso } = require('../middleware/autenticacion');
const { identificador, SEGMENTOS } = require('../servicios/validacion');
const indicadores = require('../servicios/indicadores');
const bitacora = require('../servicios/bitacora');

const rutas = express.Router();
rutas.use(exigirSesion, exigirPermiso('tablero.propio', 'tablero.equipo', 'tablero.sucursal'));

// Filtros comunes al tablero y al reporte. Devuelve null si ya respondió con un error.
async function leerFiltros(req, res) {
  const tipo = indicadores.alcance(req.usuario);
  const periodo = indicadores.validarPeriodo({ desde: req.query.desde, hasta: req.query.hasta });
  if (periodo.error) { res.status(400).json({ mensaje: periodo.error }); return null; }

  const segmento = req.query.segmento || '';
  if (segmento && !SEGMENTOS.includes(segmento)) { res.status(400).json({ mensaje: 'El segmento no es válido.' }); return null; }

  const vendedores = await indicadores.vendedoresVisibles(req.usuario, tipo);
  let idVendedor = null;
  if (req.query.vendedor && tipo !== 'propio') {
    idVendedor = identificador(req.query.vendedor);
    if (!idVendedor || !vendedores.some((v) => v.id === idVendedor)) {
      res.status(403).json({ mensaje: 'Ese vendedor no está dentro de lo que su perfil puede consultar.' });
      return null;
    }
  }
  // Solo la gerencia puede mostrar los registros de prueba (para capacitaciones), y lo ve señalado.
  const incluirPruebas = tipo === 'sucursal' && req.query.pruebas === '1';
  return { tipo, periodo, segmento, idVendedor, incluirPruebas, vendedores };
}

const encabezado = (f) => ({
  alcance: f.tipo,
  periodo: { desde: f.periodo.desde, hasta: f.periodo.hasta, anterior: f.periodo.anterior },
  filtros: { segmento: f.segmento, vendedor: f.idVendedor, pruebas: f.incluirPruebas },
  puedeIncluirPruebas: f.tipo === 'sucursal',
  vendedores: f.vendedores.map(({ id, nombre, activo }) => ({ id, nombre, activo })),
});

rutas.get('/', async (req, res) => {
  const f = await leerFiltros(req, res);
  if (!f) return;
  const datos = await indicadores.calcular(req.usuario, f);
  res.json({ ...encabezado(f), puedeExportar: req.usuario.permisos.includes('reporte.exportar'), indicadores: datos });
});

// Reporte exportable (PDF y CSV): solo la gerencia, que tiene el permiso reporte.exportar.
rutas.get('/reporte', exigirPermiso('reporte.exportar'), async (req, res) => {
  const f = await leerFiltros(req, res);
  if (!f) return;
  const { indicadores: datos, detalle } = await indicadores.reporte(req.usuario, f);
  await bitacora.registrar({
    idUsuario: req.usuario.id_usuario, accion: 'exportacion_reporte', entidad: 'reporte',
    detalle: `${f.periodo.desde} a ${f.periodo.hasta}${f.incluirPruebas ? ' (con pruebas)' : ''}`,
  });
  res.json({
    ...encabezado(f),
    generado: { fecha: new Date().toISOString(), por: `${req.usuario.nombres} ${req.usuario.apellidos}` },
    indicadores: datos,
    detalle,
  });
});

module.exports = rutas;
