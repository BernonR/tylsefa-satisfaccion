'use strict';

// Gestión de cuentas del personal (M02): exclusiva del administrador del sistema.

const express = require('express');
const { exigirSesion, exigirPermiso } = require('../middleware/autenticacion');
const { generarResumen, revisarPolitica } = require('../seguridad/contrasenas');
const { validarUsuario, identificador } = require('../servicios/validacion');
const usuarios = require('../servicios/usuarios');
const bitacora = require('../servicios/bitacora');

const rutas = express.Router();
rutas.use(exigirSesion, exigirPermiso('usuarios.administrar'));

const nombreDe = (u) => `${u.nombres} ${u.apellidos}`;
const invalido = (res, errores) => res.status(400).json({ mensaje: 'Revise los datos marcados.', errores });

// Busca la cuenta indicada en la dirección; responde 404 si no existe.
async function cuenta(req, res) {
  const id = identificador(req.params.id);
  const usuario = id && await usuarios.buscarPorId(id);
  if (!usuario) {
    res.status(404).json({ mensaje: 'No se encontró el usuario.' });
    return null;
  }
  return usuario;
}

// Reglas compartidas por el alta y la modificación.
async function revisarReglas(limpio, excepto) {
  const errores = {};
  if (limpio.correo && await usuarios.correoEnUso(limpio.correo, excepto)) errores.correo = 'Ya existe un usuario con ese correo.';
  if (Number.isInteger(limpio.idSupervisor) && limpio.idSupervisor > 0 && !(await usuarios.esSupervisorActivo(limpio.idSupervisor))) {
    errores.idSupervisor = 'El supervisor elegido no existe o está desactivado.';
  }
  return errores;
}

rutas.get('/', async (req, res) => {
  res.json({ usuarios: await usuarios.listar() });
});

rutas.get('/supervisores', async (req, res) => {
  res.json({ supervisores: await usuarios.listarSupervisores() });
});

rutas.post('/', async (req, res) => {
  const { errores, limpio } = validarUsuario(req.body, { nuevo: true });
  // Se informan juntos los errores de formato y los conflictos (correo repetido, supervisor).
  const todos = { ...(await revisarReglas(limpio, null)), ...errores };
  if (Object.keys(todos).length) return invalido(res, todos);

  const id = await usuarios.crear(limpio, await generarResumen(limpio.clave));
  await bitacora.registrar({
    idUsuario: req.usuario.id_usuario, accion: 'alta_usuario', entidad: 'usuario', idRegistro: id,
    detalle: `${nombreDe(limpio)} (${limpio.perfil})`,
  });
  res.status(201).json({ id, mensaje: 'Usuario creado. Comuníquele su contraseña temporal.' });
});

rutas.put('/:id', async (req, res) => {
  const actual = await cuenta(req, res);
  if (!actual) return;
  const { errores, limpio } = validarUsuario(req.body);
  const conflictos = { ...(await revisarReglas(limpio, actual.id_usuario)), ...errores };
  if (actual.id_usuario === req.usuario.id_usuario && limpio.perfil !== actual.perfil) {
    conflictos.perfil = 'No puede cambiar su propio perfil.';
  }
  if (actual.perfil === 'supervisor' && limpio.perfil !== 'supervisor' && await usuarios.vendedoresACargo(actual.id_usuario)) {
    conflictos.perfil = 'Este supervisor tiene vendedores a cargo. Asígneles otro supervisor primero.';
  }
  if (limpio.idSupervisor === actual.id_usuario) conflictos.idSupervisor = 'Un usuario no puede ser su propio supervisor.';
  if (Object.keys(conflictos).length) return invalido(res, conflictos);

  await usuarios.actualizar(actual.id_usuario, limpio);
  await bitacora.registrar({
    idUsuario: req.usuario.id_usuario, accion: 'modificacion_usuario', entidad: 'usuario', idRegistro: actual.id_usuario,
    detalle: `${nombreDe(limpio)} (${limpio.perfil})`,
  });
  res.json({ mensaje: 'Cambios guardados.' });
});

rutas.patch('/:id/estado', async (req, res) => {
  const actual = await cuenta(req, res);
  if (!actual) return;
  const activo = req.body?.activo === true;
  if (!activo && actual.id_usuario === req.usuario.id_usuario) {
    return res.status(409).json({ mensaje: 'No puede desactivar su propia cuenta.' });
  }
  if (!activo && actual.perfil === 'supervisor' && await usuarios.vendedoresACargo(actual.id_usuario)) {
    return res.status(409).json({ mensaje: 'Este supervisor tiene vendedores a cargo. Asígneles otro supervisor antes de desactivarlo.' });
  }
  await usuarios.cambiarEstado(actual.id_usuario, activo);
  await bitacora.registrar({
    idUsuario: req.usuario.id_usuario, accion: activo ? 'activar_usuario' : 'desactivar_usuario', entidad: 'usuario',
    idRegistro: actual.id_usuario, detalle: nombreDe(actual),
  });
  res.json({ mensaje: activo ? 'Usuario activado.' : 'Usuario desactivado. Ya no podrá iniciar sesión.' });
});

rutas.post('/:id/contrasena', async (req, res) => {
  const actual = await cuenta(req, res);
  if (!actual) return;
  const faltas = revisarPolitica(req.body?.clave);
  if (faltas.length) return invalido(res, { clave: `La contraseña necesita ${faltas.join(', ')}.` });
  await usuarios.cambiarContrasena(actual.id_usuario, await generarResumen(req.body.clave));
  await bitacora.registrar({
    idUsuario: req.usuario.id_usuario, accion: 'restablecer_contrasena', entidad: 'usuario',
    idRegistro: actual.id_usuario, detalle: nombreDe(actual),
  });
  res.json({ mensaje: 'Contraseña restablecida. Comuníquesela a la persona.' });
});

module.exports = rutas;
