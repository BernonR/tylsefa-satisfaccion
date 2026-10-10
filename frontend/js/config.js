'use strict';

// Dirección del servidor según dónde se abre la interfaz.
// En la computadora de desarrollo el mismo servidor entrega la interfaz y la API.
(function () {
  const servidores = {
    'app.tylsefa.com': 'https://api.tylsefa.com',
    'app-pruebas.tylsefa.com': 'https://api-pruebas.tylsefa.com',
  };
  window.TYLSEFA_API = servidores[location.hostname] || '';
})();
