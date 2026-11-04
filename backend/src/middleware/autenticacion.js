'use strict';

// Control de acceso: exige una sesión vigente y, cuando corresponde, un permiso
// del perfil (privilegio mínimo, RS04). Cada solicitud válida renueva la sesión.

const config = require('../config');
const { crearComprobante, leerComprobante, leerCookies, cookieSesion } = require('../seguridad/sesion');
const usuarios = require('../servicios/usuarios');

// Mientras la persona tenga pendiente cambiar su contraseña temporal, solo se le permiten
// las rutas de la propia sesión (consultarla, renovarla, cambiar la contraseña y salir).
function crearExigirSesion({ permitirCambioPendiente = false } = {}) {
  return async function (req, res, next) {
    const comprobante = leerCookies(req.headers.cookie)[config.sesion.nombreCookie];
    const datos = leerComprobante(comprobante, config.sesion);
    if (!datos) return res.status(401).json({ mensaje: 'Su sesión venció o no ha iniciado sesión.' });

    const usuario = await usuarios.buscarPorId(datos.sub);
    if (!usuario || !usuario.activo) return res.status(401).json({ mensaje: 'Su sesión ya no es válida.' });

    const cambio = datos.cambio === true;
    if (cambio && !permitirCambioPendiente) {
      return res.status(403).json({ mensaje: 'Debe cambiar su contraseña temporal antes de continuar.', codigo: 'cambio_contrasena' });
    }

    req.usuario = usuario;
    req.cambioPendiente = cambio;
    res.setHeader('Set-Cookie', cookieSesion(crearComprobante(usuario.id_usuario, config.sesion, Date.now(), { cambio }), config.sesion));
    next();
  };
}

const exigirSesion = crearExigirSesion();
const exigirSesionPropia = crearExigirSesion({ permitirCambioPendiente: true });

function exigirPermiso(...codigos) {
  return (req, res, next) => {
    const tiene = codigos.some((c) => req.usuario.permisos.includes(c));
    if (!tiene) return res.status(403).json({ mensaje: 'Su perfil no tiene acceso a esta función.' });
    next();
  };
}

module.exports = { exigirSesion, exigirSesionPropia, exigirPermiso };
