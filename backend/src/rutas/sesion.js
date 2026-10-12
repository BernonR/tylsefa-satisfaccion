'use strict';

// Inicio y cierre de sesión del personal (CU-02).

const express = require('express');
const config = require('../config');
const { crearComprobante, leerComprobante, leerCookies, cookieSesion, cookieBorrada } = require('../seguridad/sesion');
const { verificar, generarResumen, revisarPolitica } = require('../seguridad/contrasenas');
const { crearFreno } = require('../seguridad/intentos');
const { exigirSesion } = require('../middleware/autenticacion');
const usuarios = require('../servicios/usuarios');
const bitacora = require('../servicios/bitacora');

const rutas = express.Router();
const freno = crearFreno();
const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Resumen ficticio: si el correo no existe se compara igual, así el tiempo de respuesta
// no revela qué correos están registrados.
let ficticio;
const resumenFicticio = () => (ficticio ??= generarResumen('ficticio-' + Date.now()));

const MENSAJE_GENERICO = 'El correo o la contraseña no son correctos. Verifique los datos e intente de nuevo.';

rutas.post('/', async (req, res) => {
  const correo = typeof req.body?.correo === 'string' ? req.body.correo.trim() : '';
  const clave = typeof req.body?.clave === 'string' ? req.body.clave : '';

  if (!CORREO.test(correo) || correo.length > 120 || !clave || clave.length > 200) {
    return res.status(400).json({ mensaje: 'Escriba un correo válido y su contraseña.' });
  }
  if (freno.bloqueado(req.ip, correo)) {
    return res.status(429).json({ mensaje: 'Demasiados intentos fallidos. Espere 15 minutos e intente de nuevo.' });
  }

  const usuario = await usuarios.buscarPorCorreo(correo);
  const valida = await verificar(clave, usuario ? usuario.hash_contrasena : await resumenFicticio()) && Boolean(usuario);

  if (!valida) {
    freno.fallo(req.ip, correo);
    await bitacora.registrar({
      idUsuario: usuario ? usuario.id_usuario : null,
      accion: 'intento_fallido',
      entidad: 'sesion',
      detalle: `Correo: ${correo.slice(0, 120)}`,
    });
    return res.status(401).json({ mensaje: MENSAJE_GENERICO });
  }
  if (!usuario.activo) {
    return res.status(403).json({ mensaje: 'Su cuenta está desactivada. Comuníquese con el administrador del sistema.' });
  }

  freno.exito(req.ip, correo);
  res.setHeader('Set-Cookie', cookieSesion(crearComprobante(usuario.id_usuario, config.sesion), config.sesion));
  await bitacora.registrar({ idUsuario: usuario.id_usuario, accion: 'inicio_sesion', entidad: 'sesion' });
  res.json({ usuario: usuarios.publico(usuario), minutos: config.sesion.minutos });
});

rutas.get('/', exigirSesion, (req, res) => {
  res.json({ usuario: usuarios.publico(req.usuario), minutos: config.sesion.minutos });
});

// Renueva la sesión cuando la persona sigue activa en la pantalla.
rutas.post('/renovar', exigirSesion, (req, res) => res.status(204).end());

// Cada persona puede cambiar su propia contraseña escribiendo la actual.
rutas.post('/contrasena', exigirSesion, async (req, res) => {
  const actual = typeof req.body?.actual === 'string' ? req.body.actual : '';
  const nueva = typeof req.body?.nueva === 'string' ? req.body.nueva : '';
  if (!(await verificar(actual, req.usuario.hash_contrasena))) {
    return res.status(400).json({ mensaje: 'Revise los datos marcados.', errores: { actual: 'La contraseña actual no es correcta.' } });
  }
  const faltas = revisarPolitica(nueva);
  if (faltas.length) return res.status(400).json({ mensaje: 'Revise los datos marcados.', errores: { nueva: `La contraseña necesita ${faltas.join(', ')}.` } });
  if (nueva === actual) return res.status(400).json({ mensaje: 'Revise los datos marcados.', errores: { nueva: 'La nueva contraseña debe ser distinta de la actual.' } });
  await usuarios.cambiarContrasena(req.usuario.id_usuario, await generarResumen(nueva));
  await bitacora.registrar({ idUsuario: req.usuario.id_usuario, accion: 'cambio_contrasena', entidad: 'usuario', idRegistro: req.usuario.id_usuario });
  res.json({ mensaje: 'Su contraseña se cambió correctamente.' });
});

rutas.delete('/', async (req, res) => {
  const datos = leerComprobante(leerCookies(req.headers.cookie)[config.sesion.nombreCookie], config.sesion, Date.now(), 120_000);
  res.setHeader('Set-Cookie', cookieBorrada(config.sesion));
  if (datos) {
    const accion = req.query.motivo === 'inactividad' ? 'cierre_por_inactividad' : 'cierre_sesion';
    await bitacora.registrar({ idUsuario: datos.sub, accion, entidad: 'sesion' });
  }
  res.status(204).end();
});

module.exports = rutas;
