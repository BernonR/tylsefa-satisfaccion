'use strict';

// Bitácora de auditoría (RS08): quién hizo qué, sobre qué y cuándo.
// La fecha la pone la base de datos en hora de Guatemala.

const { consulta } = require('../bd');

async function registrar({ idUsuario = null, accion, entidad, idRegistro = null, detalle = null }) {
  try {
    await consulta(
      `INSERT INTO bitacora_auditoria (id_usuario, accion, entidad, id_registro_afectado, detalle)
       VALUES ($1, $2, $3, $4, $5)`,
      [idUsuario, accion, entidad, idRegistro, detalle],
    );
  } catch (error) {
    // Un fallo de la bitácora no debe tumbar la operación, pero queda en el registro del servidor.
    console.error('No se pudo escribir en la bitácora:', error.message);
  }
}

module.exports = { registrar };
