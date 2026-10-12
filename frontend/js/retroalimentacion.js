'use strict';

// M05 · Retroalimentación del vendedor: calificaciones de sus clientes, acuse "Enterado"
// y confirmación del coaching cuando el caso se cerró.
Panel.listo.then((yo) => {
  const principal = document.querySelector('.ty-principal');
  if (!Panel.tiene(yo, 'acuse.registrar')) {
    principal.innerHTML = '<div class="ty-vacio"><i class="bi bi-lock" aria-hidden="true"></i><h1 class="ty-subtitulo">Sin acceso</h1><p class="ty-secundario">Su perfil no tiene acceso a esta pantalla.</p></div>';
    return;
  }

  const { escapar, fecha, hora } = UI;
  const contenedor = document.getElementById('lista');
  const ESCALA = { 1: 'Muy insatisfecho', 2: 'Insatisfecho', 3: 'Neutral', 4: 'Satisfecho', 5: 'Muy satisfecho' };
  const ESTADO_CASO = { abierto: 'en espera de contacto', en_seguimiento: 'en seguimiento', escalado: 'escalado a la gerencia', cerrado: 'cerrado' };
  const cuando = (iso) => `${fecha(iso)} · ${hora(iso)}`;
  let respuestas = [];
  let filtro = 'por-leer';

  function tarjeta(r) {
    const caso = r.numeroCaso ? `
      <div class="caso">
        <i class="bi bi-life-preserver" aria-hidden="true"></i>
        <div><strong>${escapar(r.numeroCaso)}</strong> · ${ESTADO_CASO[r.estadoCaso]}
          ${r.resolucion ? `<div class="ty-secundario mt-1">${escapar(r.resolucion)}</div>` : ''}</div>
      </div>` : '';
    let acciones = '';
    if (!r.enterado) {
      acciones = `<button type="button" class="btn btn-ty-primario" data-accion="enterado" data-id="${r.id}"><i class="bi bi-check2" aria-hidden="true"></i>Enterado</button>`;
    } else {
      acciones = `<span class="ty-leyenda"><i class="bi bi-check2-all" aria-hidden="true"></i> Leído el ${escapar(cuando(r.enterado))}</span>`;
      if (r.estadoCaso === 'cerrado') {
        acciones += r.coaching
          ? `<span class="ty-leyenda"><i class="bi bi-mortarboard" aria-hidden="true"></i> Coaching confirmado el ${escapar(cuando(r.coaching))}</span>`
          : `<button type="button" class="btn btn-ty-secundario" data-accion="coaching" data-id="${r.id}"><i class="bi bi-mortarboard" aria-hidden="true"></i>Confirmo que recibí el coaching</button>`;
      }
    }
    return `
      <article class="ty-tarjeta ty-retro-tarjeta${r.enterado ? ' leida' : ''}" data-id="${r.id}">
        <header>
          <span class="ty-nota n${r.calificacion}">${r.calificacion}<small>/5</small></span>
          <div class="quien">
            <strong>${escapar(r.cliente)}</strong>${r.esPrueba ? '<span class="ty-etiqueta-prueba">Prueba</span>' : ''}
            <div class="ty-secundario">${ESCALA[r.calificacion]}</div>
            <div class="ty-leyenda">${escapar(r.cotizacion)} · ${escapar(cuando(r.fechaHora))}</div>
          </div>
        </header>
        <p class="compra"><i class="bi ${r.compro ? 'bi-bag-check' : 'bi-bag-x'}" aria-hidden="true"></i>${r.compro ? 'Compró' : `No compró${r.motivo ? `: ${escapar(r.motivo)}` : ''}`}</p>
        ${r.comentario ? `<blockquote class="ty-cita">“${escapar(r.comentario)}”</blockquote>` : '<p class="ty-secundario mb-0">Sin comentario.</p>'}
        ${caso}
        <footer>${acciones}</footer>
      </article>`;
  }

  function pintar() {
    const calificadas = respuestas.filter((r) => !r.esPrueba);
    const promedio = calificadas.length ? calificadas.reduce((t, r) => t + r.calificacion, 0) / calificadas.length : null;
    document.getElementById('k-promedio').textContent = promedio === null ? '—' : promedio.toFixed(1);
    const porLeer = respuestas.filter((r) => !r.enterado).length;
    document.getElementById('k-por-leer').textContent = porLeer;
    Panel.cuentaMenu('retroalimentacion', porLeer);
    document.getElementById('k-casos').textContent = respuestas.filter((r) => r.numeroCaso && r.estadoCaso !== 'cerrado').length;
    const visibles = filtro === 'por-leer'
      ? respuestas.filter((r) => !r.enterado || (r.estadoCaso === 'cerrado' && !r.coaching))
      : respuestas;
    contenedor.innerHTML = visibles.length
      ? visibles.map(tarjeta).join('')
      : `<div class="ty-vacio"><i class="bi bi-inbox" aria-hidden="true"></i><p class="ty-secundario mb-0">${filtro === 'por-leer' ? 'No tiene retroalimentación por leer.' : 'Aún no hay calificaciones de sus clientes.'}</p></div>`;
  }

  async function cargar() {
    respuestas = (await Api.pedir('/api/retroalimentacion')).respuestas;
    pintar();
  }

  document.querySelector('.ty-segmentos').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-filtro]');
    if (!b) return;
    filtro = b.dataset.filtro;
    document.querySelectorAll('.ty-segmentos button').forEach((x) => {
      x.classList.toggle('activo', x === b);
      x.setAttribute('aria-selected', String(x === b));
    });
    pintar();
  });

  contenedor.addEventListener('click', async (e) => {
    const b = e.target.closest('button[data-accion]');
    if (!b) return;
    UI.ocupado(b, true, b.dataset.accion === 'enterado' ? 'Guardando' : 'Confirmando');
    try {
      const r = await Api.pedir(`/api/retroalimentacion/${b.dataset.id}/${b.dataset.accion}`, { metodo: 'POST' });
      Tylsefa.aviso(r.mensaje);
      await cargar();
    } catch (error) {
      Tylsefa.aviso(error.message, 'bi-exclamation-circle-fill', 'var(--ty-error)');
      UI.ocupado(b, false);
    }
  });

  cargar().catch((error) => Tylsefa.aviso(error.message, 'bi-exclamation-circle-fill', 'var(--ty-error)'));
});
