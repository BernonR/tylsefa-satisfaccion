'use strict';

// M05 · Retroalimentación del vendedor: sus calificaciones, acuse "Enterado" y confirmación del coaching.

const express = require('express');
const { exigirSesion, exigirPermiso } = require('../middleware/autenticacion');
const { identificador } = require('../servicios/validacion');
const retro = require('../servicios/retroalimentacion');
const bitacora = require('../servicios/bitacora');

const rutas = express.Router();
rutas.use(exigirSesion, exigirPermiso('acuse.registrar'));

rutas.get('/', async (req, res) => {
  res.json({ respuestas: await retro.listar(req.usuario.id_usuario) });
});

rutas.post('/:id/enterado', async (req, res) => {
  const id = identificador(req.params.id);
  if (!id || !(await retro.enterado(id, req.usuario.id_usuario))) {
    return res.status(409).json({ mensaje: 'Esa retroalimentación no es suya o ya estaba marcada como leída.' });
  }
  await bitacora.registrar({ idUsuario: req.usuario.id_usuario, accion: 'acuse_retroalimentacion', entidad: 'encuesta_respuesta', idRegistro: id });
  res.json({ mensaje: 'Marcado como enterado.' });
});

rutas.post('/:id/coaching', async (req, res) => {
  const id = identificador(req.params.id);
  const caso = id && await retro.puedeConfirmarCoaching(id, req.usuario.id_usuario);
  if (!caso) return res.status(409).json({ mensaje: 'Puede confirmar el coaching cuando el caso esté cerrado y haya marcado Enterado.' });
  if (caso.ya) return res.status(409).json({ mensaje: 'El coaching de este caso ya estaba confirmado.' });
  await bitacora.registrar({
    idUsuario: req.usuario.id_usuario, accion: 'confirmacion_coaching', entidad: 'encuesta_respuesta', idRegistro: id,
    detalle: `Coaching recibido por ${caso.numeroCaso}`,
  });
  res.json({ mensaje: 'Coaching confirmado. Gracias.' });
});

module.exports = rutas;
