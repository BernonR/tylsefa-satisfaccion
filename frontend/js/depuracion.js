'use strict';

// RF15 · Depuración de los registros de prueba (solo el administrador, en la pantalla Usuarios).
Panel.listo.then((yo) => {
  if (!Panel.tiene(yo, 'usuarios.administrar')) return;
  const boton = document.getElementById('depurar');
  const texto = document.getElementById('resumen-pruebas');
  const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

  async function contar() {
    try {
      const r = await Api.pedir('/api/registros-prueba');
      texto.textContent = r.cotizaciones
        ? `Hay ${plural(r.cotizaciones, 'cotización', 'cotizaciones')} de prueba, ${plural(r.respuestas, 'respuesta', 'respuestas')} y ${plural(r.casos, 'caso', 'casos')}.`
        : 'No hay registros de prueba.';
      boton.disabled = !r.cotizaciones;
      return r;
    } catch (error) {
      texto.textContent = error.message;
      return null;
    }
  }

  boton.addEventListener('click', async () => {
    const r = await contar();
    if (!r || !r.cotizaciones) return;
    const ok = await UI.confirmar({
      titulo: 'Eliminar registros de prueba',
      texto: `Se eliminarán ${plural(r.cotizaciones, 'cotización', 'cotizaciones')}, ${plural(r.respuestas, 'respuesta', 'respuestas')} y ${plural(r.casos, 'caso', 'casos')} marcados como prueba. Esta acción no se puede deshacer.`,
      boton: 'Eliminar', peligro: true,
    });
    if (!ok) return;
    UI.ocupado(boton, true, 'Eliminando');
    try {
      const resultado = await Api.pedir('/api/registros-prueba', { metodo: 'DELETE' });
      Tylsefa.aviso(resultado.mensaje);
    } catch (error) {
      Tylsefa.aviso(error.message, 'bi-exclamation-circle-fill', 'var(--ty-error)');
    } finally {
      UI.ocupado(boton, false);
      contar();
    }
  });

  contar();
});
