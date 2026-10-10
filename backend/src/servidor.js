'use strict';

// Servidor de la aplicación Tylsefa.

const path = require('node:path');
const express = require('express');
const config = require('./config');
const { consulta } = require('./bd');
const seguridad = require('./middleware/seguridad');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1); // Render atiende detrás de un proxy: así se conoce la IP real

app.use(seguridad.encabezados);
app.use(seguridad.origenes);
app.use(express.json({ limit: '20kb' }));
app.use('/api', seguridad.mismoOrigen);

// Comprobación del ambiente: responde si el servidor llega a la base de datos.
app.get('/salud', async (req, res) => {
  try {
    const { rows } = await consulta(
      "SELECT (SELECT count(*)::int FROM perfil) AS perfiles, current_setting('TimeZone') AS zona_horaria",
    );
    res.json({ estado: 'ok', base_de_datos: 'conectada', perfiles: rows[0].perfiles, zona_horaria: rows[0].zona_horaria });
  } catch (error) {
    console.error('No se pudo consultar la base de datos:', error.message);
    res.status(503).json({ estado: 'error', base_de_datos: error.estado === 503 ? 'sin configurar' : 'sin conexión' });
  }
});

app.use('/api/sesion', require('./rutas/sesion'));
app.use('/api/usuarios', require('./rutas/usuarios'));
app.use('/api', (req, res) => res.status(404).json({ mensaje: 'Ruta no encontrada.' }));

// En la computadora de desarrollo el mismo servidor entrega la interfaz.
if (!config.produccion) {
  app.use(express.static(path.join(__dirname, '..', '..', 'frontend')));
}

// Errores no previstos: el detalle queda en el registro del servidor, nunca en la respuesta.
app.use((error, req, res, next) => {
  if (error.type === 'entity.parse.failed') return res.status(400).json({ mensaje: 'La solicitud no es válida.' });
  console.error(error);
  res.status(500).json({ mensaje: 'Ocurrió un error inesperado. Intente de nuevo.' });
});

if (require.main === module) {
  app.listen(config.puerto, () => console.log(`Servidor Tylsefa en http://localhost:${config.puerto}`));
}

module.exports = app;
