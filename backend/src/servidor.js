'use strict';

// Servidor de la aplicación Tylsefa.
// En esta etapa solo comprueba que el ambiente funciona: sirve la interfaz
// en la computadora de desarrollo y confirma la conexión con la base de datos.

const path = require('node:path');
const express = require('express');
const { Pool } = require('pg');

// En la computadora de desarrollo las variables se leen de backend/.env.
// En el servicio publicado las entrega el hospedaje y ese archivo no existe.
try {
  process.loadEnvFile(path.join(__dirname, '..', '.env'));
} catch {
  // Sin archivo .env: se usan las variables que ya existan en el ambiente.
}

const PUERTO = Number(process.env.PORT) || 3000;
const CADENA_CONEXION = process.env.DATABASE_URL;

const base = CADENA_CONEXION
  ? new Pool({ connectionString: CADENA_CONEXION, max: 5 })
  : null;

const app = express();
app.disable('x-powered-by');
app.use(express.json());

// Comprobación del ambiente: responde si el servidor llega a la base de datos.
app.get('/salud', async (peticion, respuesta) => {
  if (!base) {
    return respuesta.status(503).json({
      estado: 'error',
      base_de_datos: 'sin configurar',
      detalle: 'Falta DATABASE_URL en el archivo backend/.env',
    });
  }
  try {
    const resultado = await base.query('SELECT count(*)::int AS perfiles FROM perfil');
    respuesta.json({
      estado: 'ok',
      base_de_datos: 'conectada',
      perfiles: resultado.rows[0].perfiles,
    });
  } catch (error) {
    // El detalle queda solo en la consola del servidor, nunca en la respuesta.
    console.error('No se pudo consultar la base de datos:', error.message);
    respuesta.status(503).json({ estado: 'error', base_de_datos: 'sin conexión' });
  }
});

// En desarrollo el mismo servidor entrega la interfaz. Publicada, la interfaz vive aparte.
if (process.env.NODE_ENV !== 'production') {
  app.use(express.static(path.join(__dirname, '..', '..', 'frontend')));
}

app.listen(PUERTO, () => {
  console.log(`Servidor Tylsefa en http://localhost:${PUERTO}`);
});
