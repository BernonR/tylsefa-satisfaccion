'use strict';

// Consulta de usuarios: exclusiva del administrador del sistema.

const express = require('express');
const { exigirSesion, exigirPermiso } = require('../middleware/autenticacion');
const usuarios = require('../servicios/usuarios');

const rutas = express.Router();

rutas.get('/', exigirSesion, exigirPermiso('usuarios.administrar'), async (req, res) => {
  res.json({ usuarios: await usuarios.listar() });
});

module.exports = rutas;
