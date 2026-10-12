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
  // Correos de aviso (M05) por Resend. Sin llave no se envía nada (desarrollo y pruebas).
  correo: {
    llave: process.env.RESEND_API_KEY || '',
    // Dirección que no recibe respuestas: todo lo del caso debe quedar registrado en el sistema.
    remitente: process.env.CORREO_REMITENTE || 'Tylsefa Avisos <no-responder@tylsefa.com>',
    // Dominios inventados para los datos de prueba: nunca se les escribe.
    dominiosOmitidos: ['prueba.tylsefa.com', 'pruebas.tylsefa.com'],
  },
  // Dirección de la interfaz para los enlaces de los correos.
  urlAplicacion: process.env.URL_APLICACION || (process.env.ORIGEN_PERMITIDO || '').split(',')[0].trim() || 'http://localhost:3000',
  // Tableta de la terminal de autoservicio (M04): queda autorizada 90 días tras activarla.
  terminal: {
    secreto,
    dias: 90,
    nombreCookie: 'tylsefa_terminal',
    segura: produccion,
  },
};
