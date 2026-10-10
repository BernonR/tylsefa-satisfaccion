'use strict';

// Freno de intentos fallidos de inicio de sesión: después de 5 fallos seguidos
// con el mismo correo desde la misma dirección, se espera 15 minutos.

const MAXIMO = 5;
const VENTANA = 15 * 60 * 1000;

function crearFreno({ maximo = MAXIMO, ventana = VENTANA } = {}) {
  const registros = new Map();

  function clave(ip, correo) {
    return `${ip}|${String(correo || '').toLowerCase()}`;
  }

  return {
    bloqueado(ip, correo, ahora = Date.now()) {
      const r = registros.get(clave(ip, correo));
      if (!r) return false;
      if (ahora - r.inicio > ventana) { registros.delete(clave(ip, correo)); return false; }
      return r.fallos >= maximo;
    },
    fallo(ip, correo, ahora = Date.now()) {
      const k = clave(ip, correo);
      const r = registros.get(k);
      if (!r || ahora - r.inicio > ventana) registros.set(k, { fallos: 1, inicio: ahora });
      else r.fallos += 1;
    },
    exito(ip, correo) {
      registros.delete(clave(ip, correo));
    },
  };
}

module.exports = { crearFreno };
