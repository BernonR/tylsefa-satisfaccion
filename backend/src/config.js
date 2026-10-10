'use strict';

// Configuración del servidor. Todo valor sensible llega por variables de entorno:
// en la computadora de desarrollo desde backend/.env y en la publicación desde Render.

const path = require('node:path');
const crypto = require('node:crypto');

try {
  process.loadEnvFile(path.join(__dirname, '..', '.env'));
} catch {
  // Sin archivo .env: se usan las variables que ya existan en el ambiente.
}

const produccion = process.env.NODE_ENV === 'production';

let secreto = process.env.SESION_SECRETO;
if (!secreto) {
  if (produccion) throw new Error('Falta la variable SESION_SECRETO.');
  secreto = crypto.randomBytes(32).toString('hex');
  console.warn('Aviso: SESION_SECRETO no está definido. Se usa uno temporal; las sesiones se pierden al reiniciar.');
}

module.exports = {
  produccion,
  puerto: Number(process.env.PORT) || 3000,
  cadenaConexion: process.env.DATABASE_URL,
  origenesPermitidos: (process.env.ORIGEN_PERMITIDO || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),
  sesion: {
    secreto,
    minutos: Number(process.env.SESION_MINUTOS) || 15,
    nombreCookie: 'tylsefa_sesion',
    segura: produccion,
  },
};
