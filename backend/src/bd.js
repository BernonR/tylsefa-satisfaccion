'use strict';

// Conexión con PostgreSQL (Neon). Todas las consultas usan parámetros ($1, $2...),
// nunca texto concatenado, para impedir la inyección de instrucciones (RS09).

const { Pool } = require('pg');
const { cadenaConexion } = require('./config');

// El modo de cifrado se fija aquí y no en la cadena: la próxima versión de la
// librería cambiará cómo interpreta el parámetro sslmode.
function prepararCadena(cadena) {
  const direccion = new URL(cadena);
  direccion.searchParams.delete('sslmode');
  return direccion.toString();
}

function crearPool() {
  if (!cadenaConexion) return null;
  const local = /@(localhost|127\.0\.0\.1)[:/]/.test(cadenaConexion);
  return new Pool({
    connectionString: local ? cadenaConexion : prepararCadena(cadenaConexion),
    ssl: local ? false : { rejectUnauthorized: true },
    max: 5,
    allowExitOnIdle: true, // los scripts y las pruebas terminan solos al quedar sin consultas
  });
}

const pool = crearPool();

async function consulta(texto, valores = []) {
  if (!pool) {
    const error = new Error('La base de datos no está configurada.');
    error.estado = 503;
    throw error;
  }
  return pool.query(texto, valores);
}

module.exports = { pool, consulta };
