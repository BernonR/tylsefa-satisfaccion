'use strict';

// Sesión del personal: un comprobante firmado que vive en una cookie protegida.
// Vence tras los minutos configurados sin actividad (RS11); cada solicitud válida
// lo renueva. El servidor rechaza cualquier comprobante vencido o alterado.
// La cookie dura dos minutos más que el comprobante para que el navegador aún la
// envíe al cerrar por inactividad; el vencimiento real lo decide el comprobante.

const crypto = require('node:crypto');

const MARGEN_COOKIE = 120; // segundos
const b64 = (buf) => Buffer.from(buf).toString('base64url');

function firmar(contenido, secreto) {
  return crypto.createHmac('sha256', secreto).update(contenido).digest('base64url');
}

function crearComprobante(idUsuario, { secreto, minutos }, ahora = Date.now()) {
  const contenido = b64(JSON.stringify({ sub: idUsuario, exp: ahora + minutos * 60 * 1000 }));
  return `${contenido}.${firmar(contenido, secreto)}`;
}

// La tolerancia solo se usa al cerrar sesión: permite dejar en la bitácora un cierre
// por inactividad aunque el comprobante haya vencido hace un momento.
function leerComprobante(comprobante, { secreto }, ahora = Date.now(), toleranciaMs = 0) {
  if (typeof comprobante !== 'string') return null;
  const [contenido, firma] = comprobante.split('.');
  if (!contenido || !firma) return null;
  const esperada = Buffer.from(firmar(contenido, secreto));
  const recibida = Buffer.from(firma);
  if (esperada.length !== recibida.length || !crypto.timingSafeEqual(esperada, recibida)) return null;
  let datos;
  try {
    datos = JSON.parse(Buffer.from(contenido, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!Number.isInteger(datos.sub) || typeof datos.exp !== 'number' || datos.exp + toleranciaMs <= ahora) return null;
  return datos;
}

function leerCookies(encabezado = '') {
  const cookies = {};
  for (const parte of encabezado.split(';')) {
    const i = parte.indexOf('=');
    if (i < 0) continue;
    const nombre = parte.slice(0, i).trim();
    if (nombre) cookies[nombre] = decodeURIComponent(parte.slice(i + 1).trim());
  }
  return cookies;
}

function cookieSesion(comprobante, { nombreCookie, minutos, segura }) {
  return [
    `${nombreCookie}=${comprobante}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${minutos * 60 + MARGEN_COOKIE}`,
    segura ? 'Secure' : '',
  ].filter(Boolean).join('; ');
}

function cookieBorrada({ nombreCookie, segura }) {
  return [`${nombreCookie}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0', segura ? 'Secure' : '']
    .filter(Boolean).join('; ');
}

module.exports = { crearComprobante, leerComprobante, leerCookies, cookieSesion, cookieBorrada };
