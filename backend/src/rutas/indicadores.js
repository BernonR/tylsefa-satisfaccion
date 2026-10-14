'use strict';

// M06 · Tablero de indicadores (RF13). El alcance lo fija el perfil (RS04): el vendedor ve
// sus interacciones, el supervisor las de su equipo y la gerencia toda la sucursal.

const express = require('express');
const { exigirSesion, exigirPermiso } = require('../middleware/autenticacion');
const { identificador, SEGMENTOS } = require('../servicios/validacion');
const indicadores = require('../servicios/indicadores');

const rutas = express.Router();
rutas.use(exigirSesion, exigirPermiso('tablero.propio', 'tablero.equipo', 'tablero.sucursal'));

rutas.get('/', async (req, res) => {
  const tipo = indicadores.alcance(req.usuario);
  const periodo = indicadores.validarPeriodo({ desde: req.query.desde, hasta: req.query.hasta });
  if (periodo.error) return res.status(400).json({ mensaje: periodo.error });

  const segmento = req.query.segmento || '';
  if (segmento && !SEGMENTOS.includes(segmento)) return res.status(400).json({ mensaje: 'El segmento no es válido.' });

  const vendedores = await indicadores.vendedoresVisibles(req.usuario, tipo);
  let idVendedor = null;
  if (req.query.vendedor && tipo !== 'propio') {
    idVendedor = identificador(req.query.vendedor);
    if (!idVendedor || !vendedores.some((v) => v.id === idVendedor)) {
      return res.status(403).json({ mensaje: 'Ese vendedor no está dentro de lo que su perfil puede consultar.' });
    }
  }
  // Solo la gerencia puede mostrar los registros de prueba (para capacitaciones), y lo ve señalado.
  const incluirPruebas = tipo === 'sucursal' && req.query.pruebas === '1';

  const datos = await indicadores.calcular(req.usuario, { periodo, segmento, idVendedor, incluirPruebas });
  res.json({
    alcance: tipo,
    periodo: { desde: periodo.desde, hasta: periodo.hasta, anterior: periodo.anterior },
    filtros: { segmento, vendedor: idVendedor, pruebas: incluirPruebas },
    puedeIncluirPruebas: tipo === 'sucursal',
    vendedores: vendedores.map(({ id, nombre, activo }) => ({ id, nombre, activo })),
    indicadores: datos,
  });
});

module.exports = rutas;
