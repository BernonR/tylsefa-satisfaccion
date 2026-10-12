'use strict';

// M04 · Activación de la tableta como terminal de autoservicio (supervisor o administrador).
Panel.listo.then((yo) => {
  const principal = document.querySelector('.ty-principal');
  if (!Panel.tiene(yo, 'cotizacion.registrar', 'usuarios.administrar')) {
    principal.innerHTML = '<div class="ty-vacio"><i class="bi bi-lock" aria-hidden="true"></i><h1 class="ty-subtitulo">Sin acceso</h1><p class="ty-secundario">Su perfil no tiene acceso a esta pantalla.</p></div>';
    return;
  }

  const titulo = document.getElementById('titulo-estado');
  const texto = document.getElementById('texto-estado');
  const activar = document.getElementById('activar');
  const abrir = document.getElementById('abrir');
  const desactivar = document.getElementById('desactivar');
  const error = (e) => Tylsefa.aviso(e.message, 'bi-exclamation-circle-fill', 'var(--ty-error)');

  function pintar(estado) {
    const activa = Boolean(estado);
    document.querySelector('.ty-activar .estado').classList.toggle('activa', activa);
    titulo.textContent = activa ? 'Este equipo ya funciona como terminal' : 'Este equipo no es una terminal';
    texto.textContent = activa
      ? `Autorizado hasta el ${UI.fecha(estado.hasta)}. Puede abrir la encuesta o desactivarlo.`
      : 'Siga estos pasos para dejar la tableta lista para la encuesta.';
    document.getElementById('instrucciones').hidden = activa;
    activar.hidden = activa;
    abrir.hidden = !activa;
    desactivar.hidden = !activa;
  }

  async function revisar() {
    try {
      pintar(await Api.pedir('/api/terminal/estado', { redirigir: false }));
    } catch (e) {
      if (e.estado === 401) pintar(null); else error(e);
    }
  }

  activar.addEventListener('click', async () => {
    const si = await UI.confirmar({
      titulo: '¿Activar esta tableta?',
      texto: 'Su sesión se cerrará y en este equipo quedará solo la encuesta para los clientes.',
      boton: 'Activar',
    });
    if (!si) return;
    UI.ocupado(activar, true, 'Activando');
    try {
      await Api.pedir('/api/terminal/activar', { metodo: 'POST', redirigir: false });
      location.replace('terminal.html');
    } catch (e) {
      error(e);
      UI.ocupado(activar, false);
    }
  });

  desactivar.addEventListener('click', async () => {
    const si = await UI.confirmar({
      titulo: '¿Desactivar la terminal?',
      texto: 'Este equipo dejará de mostrar la encuesta hasta que se vuelva a activar.',
      boton: 'Desactivar',
      peligro: true,
    });
    if (!si) return;
    try {
      const r = await Api.pedir('/api/terminal/activacion', { metodo: 'DELETE' });
      Tylsefa.aviso(r.mensaje);
      pintar(null);
    } catch (e) {
      error(e);
    }
  });

  revisar();
});
