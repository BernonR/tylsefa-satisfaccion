'use strict';

// Autorización de la terminal de autoservicio (M04). Un supervisor o el administrador
// activa la tableta una vez; desde entonces la tableta guarda un comprobante firmado
// que solo sirve para la encuesta. El cliente nunca escribe credenciales (RS07).
// Se firma con una llave derivada, distinta de la sesión del personal: el comprobante
// de la terminal no abre el panel y una sesión del personal no sirve como terminal.

const crypto = require('node:crypto');

const b64 = (texto) => Buffer.from(texto).toString('base64url');
const llave = (secreto) => crypto.createHmac('sha256', secreto).update('tylsefa-terminal').digest();
const firmar = (contenido, secreto) => crypto.createHmac('sha256', llave(secreto)).update(contenido).digest('base64url');

function crearAutorizacion(idUsuario, { secreto, dias }, ahora = Date.now()) {
  const datos = { tipo: 'terminal', id: crypto.randomBytes(6).toString('hex'), por: idUsuario, exp: ahora + dias * 86400000 };
  const contenido = b64(JSON.stringify(datos));
  return { valor: `${contenido}.${firmar(contenido, secreto)}`, datos };
}

function leerAutorizacion(valor, { secreto }, ahora = Date.now()) {
  if (typeof valor !== 'string') return null;
  const [contenido, firma] = valor.split('.');
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
  if (datos.tipo !== 'terminal' || typeof datos.id !== 'string' || typeof datos.exp !== 'number' || datos.exp <= ahora) return null;
  return datos;
}

// La cookie solo viaja a las rutas de la terminal.
function cookieTerminal(valor, { nombreCookie, dias, segura }) {
  return [`${nombreCookie}=${valor}`, 'Path=/api/terminal', 'HttpOnly', 'SameSite=Lax', `Max-Age=${dias * 86400}`, segura ? 'Secure' : '']
    .filter(Boolean).join('; ');
}

function cookieTerminalBorrada({ nombreCookie, segura }) {
  return [`${nombreCookie}=`, 'Path=/api/terminal', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0', segura ? 'Secure' : '']
    .filter(Boolean).join('; ');
}

module.exports = { crearAutorizacion, leerAutorizacion, cookieTerminal, cookieTerminalBorrada };
