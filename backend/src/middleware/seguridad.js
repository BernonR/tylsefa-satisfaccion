'use strict';

// Encabezados de seguridad, permisos de origen (CORS) y control de origen
// en las operaciones que cambian datos.

const { origenesPermitidos } = require('../config');

function encabezados(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
  next();
}

function origenes(req, res, next) {
  const origen = req.headers.origin;
  if (origen && origenesPermitidos.includes(origen)) {
    res.setHeader('Access-Control-Allow-Origin', origen);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Vary', 'Origin');
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      res.setHeader('Access-Control-Max-Age', '600');
      return res.status(204).end();
    }
  }
  next();
}

// Una operación que cambia datos solo se acepta desde la propia interfaz.
function mismoOrigen(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origen = req.headers.origin;
  if (!origen) return next();
  const propio = `${req.protocol}://${req.get('host')}`;
  if (origen === propio || origenesPermitidos.includes(origen)) return next();
  return res.status(403).json({ mensaje: 'Origen no permitido.' });
}

module.exports = { encabezados, origenes, mismoOrigen };
