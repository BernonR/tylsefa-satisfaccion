'use strict';

// RF15 · Depuración de los registros de prueba: solo el administrador.

const express = require('express');
const { exigirSesion, exigirPermiso } = require('../middleware/autenticacion');
const depuracion = require('../servicios/depuracion');
const bitacora = require('../servicios/bitacora');

const rutas = express.Router();
rutas.use(exigirSesion, exigirPermiso('usuarios.administrar'));

rutas.get('/', async (req, res) => {
  res.json(await depuracion.resumen());
});

rutas.delete('/', async (req, res) => {
  const borrado = await depuracion.depurar();
  await bitacora.registrar({
    idUsuario: req.usuario.id_usuario, accion: 'depuracion_pruebas', entidad: 'cotizacion',
    detalle: `${borrado.cotizaciones} cotizaciones, ${borrado.respuestas} respuestas y ${borrado.casos} casos de prueba`,
  });
  res.json({
    ...borrado,
    mensaje: borrado.cotizaciones
      ? `Se eliminaron ${borrado.cotizaciones} cotizaciones de prueba con sus respuestas y casos.`
      : 'No había registros de prueba para eliminar.',
  });
});

module.exports = rutas;
