'use strict';

// Comunicación con el servidor. La sesión viaja en una cookie protegida (HttpOnly):
// la interfaz nunca la lee ni la guarda.
(function () {
  class ErrorApi extends Error {
    constructor(mensaje, estado) {
      super(mensaje);
      this.estado = estado;
    }
  }

  async function pedir(ruta, { metodo = 'GET', datos, redirigir = true } = {}) {
    let respuesta;
    try {
      respuesta = await fetch(window.TYLSEFA_API + ruta, {
        method: metodo,
        credentials: 'include',
        headers: datos ? { 'Content-Type': 'application/json' } : undefined,
        body: datos ? JSON.stringify(datos) : undefined,
      });
    } catch {
      throw new ErrorApi('No hay conexión con el servidor. Revise su conexión a internet e intente de nuevo.', 0);
    }

    if (respuesta.status === 401 && redirigir) {
      location.replace('index.html?motivo=sesion');
      return new Promise(() => {}); // la página se está cambiando
    }
    if (respuesta.status === 204) return null;

    const cuerpo = await respuesta.json().catch(() => ({}));
    if (!respuesta.ok) {
      throw new ErrorApi(cuerpo.mensaje || 'Ocurrió un error inesperado. Intente de nuevo.', respuesta.status);
    }
    return cuerpo;
  }

  window.Api = { pedir, ErrorApi };
})();
