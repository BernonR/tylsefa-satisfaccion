'use strict';

// Control de acceso: exige una sesión vigente y, cuando corresponde, un permiso
// del perfil (privilegio mínimo, RS04). Cada solicitud válida renueva la sesión.

const config = require('../config');
const { crearComprobante, leerComprobante, leerCookies, cookieSesion } = require('../seguridad/sesion');
const usuarios = require('../servicios/usuarios');

async function exigirSesion(req, res, next) {
  const comprobante = leerCookies(req.headers.cookie)[config.sesion.nombreCookie];
  const datos = leerComprobante(comprobante, config.sesion);
  if (!datos) return res.status(401).json({ mensaje: 'Su sesión venció o no ha iniciado sesión.' });

  const usuario = await usuarios.buscarPorId(datos.sub);
  if (!usuario || !usuario.activo) return res.status(401).json({ mensaje: 'Su sesión ya no es válida.' });

  req.usuario = usuario;
  res.setHeader('Set-Cookie', cookieSesion(crearComprobante(usuario.id_usuario, config.sesion), config.sesion));
  next();
}

function exigirPermiso(...codigos) {
  return (req, res, next) => {
    const tiene = codigos.some((c) => req.usuario.permisos.includes(c));
    if (!tiene) return res.status(403).json({ mensaje: 'Su perfil no tiene acceso a esta función.' });
    next();
  };
}

module.exports = { exigirSesion, exigirPermiso };
