'use strict';

// Catálogo de personal en modo consulta (supervisor y gerente). Sin datos de acceso.

const express = require('express');
const { exigirSesion, exigirPermiso } = require('../middleware/autenticacion');
const usuarios = require('../servicios/usuarios');

const rutas = express.Router();

rutas.get('/', exigirSesion, exigirPermiso('catalogos.consultar', 'catalogos.gestionar'), async (req, res) => {
  const personal = (await usuarios.listar())
    .filter((u) => u.activo && u.perfil !== 'administrador')
    .map(({ id, nombres, apellidos, correo, perfil, supervisor }) => ({ id, nombres, apellidos, correo, perfil, supervisor }));
  res.json({ personal });
});

module.exports = rutas;
