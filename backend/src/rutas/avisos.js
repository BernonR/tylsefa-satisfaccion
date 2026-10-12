'use strict';

// Avisos dentro de la aplicación (RF11): se muestran al iniciar sesión y en el menú.

const express = require('express');
const { exigirSesion } = require('../middleware/autenticacion');
const avisos = require('../servicios/avisos');

const rutas = express.Router();
rutas.get('/', exigirSesion, async (req, res) => res.json(await avisos.delUsuario(req.usuario)));

module.exports = rutas;
