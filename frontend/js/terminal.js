'use strict';

// M04 · Terminal de autoservicio (CU-05).
// Número de cotización → calificación → compra → motivo (si no compró) → comentario → gracias.
// Sin sesión del cliente (RS07): al terminar, o tras 60 segundos sin tocar la pantalla,
// todo se borra y vuelve al inicio. Si se corta el internet, la respuesta se guarda en la
// tableta y se envía al volver la conexión (RNF05).
(function () {
  const API = (window.TYLSEFA_API || '') + '/api/terminal';
  const COLA = 'tylsefa_terminal_pendientes';
  const SEGUNDOS_LISTO = 12;

  const terminal = document.getElementById('terminal');
  const visor = document.getElementById('visor');
  const continuar = document.getElementById('continuar');
  const mensajeNumero = document.getElementById('mensaje-numero');
  const comentario = document.getElementById('comentario');
  const TEXTO_AYUDA = mensajeNumero.textContent;

  let segundosInactividad = 60;
  let motivos = [];
  let respuesta = null;   // lo que el cliente va contestando
  let temporizador = null;
  let cuentaRegresiva = null;

  // ---------- Comunicación ----------
  async function pedir(ruta, datos) {
    let r;
    try {
      r = await fetch(API + ruta, {
        method: datos ? 'POST' : 'GET',
        credentials: 'include',
        headers: datos ? { 'Content-Type': 'application/json' } : undefined,
        body: datos ? JSON.stringify(datos) : undefined,
      });
    } catch {
      const e = new Error('Sin conexión'); e.estado = 0; throw e;
    }
    const cuerpo = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(cuerpo.mensaje || 'Ocurrió un error. Intente de nuevo.'); e.estado = r.status; throw e; }
    return cuerpo;
  }

  // ---------- Pasos ----------
  const ETAPA = { numero: 1, calificacion: 2, compra: 2, motivo: 2, comentario: 2, listo: 3 };
  const TEXTOS = {
    numero: ['Cuéntenos cómo le atendimos', 'Ingrese el número que aparece en su cotización. Le tomará menos de un minuto.'],
    calificacion: ['Su opinión cuenta', 'Toque la opción que mejor describa su experiencia.'],
    compra: ['Su opinión cuenta', 'Nos interesa también cuando no se concreta la compra.'],
    motivo: ['Su opinión cuenta', 'Nos ayuda a mejorar precios, existencias y condiciones.'],
    comentario: ['Ya casi terminamos', 'Puede dejarnos un comentario o enviar su respuesta tal como está.'],
    listo: ['Respuesta recibida', 'Ya puede retirarse. La pantalla volverá al inicio sola.'],
  };

  function mostrar(paso) {
    terminal.dataset.paso = paso;
    document.querySelectorAll('.paso').forEach((n) => { n.hidden = n.dataset.paso !== paso; });
    const etapa = ETAPA[paso];
    document.querySelectorAll('.ty-pasos li').forEach((li) => {
      const n = Number(li.dataset.etapa);
      li.classList.toggle('actual', n === etapa);
      li.classList.toggle('hecho', etapa && n < etapa);
      if (n === etapa) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current');
    });
    if (TEXTOS[paso]) {
      document.getElementById('titulo').textContent = TEXTOS[paso][0];
      document.getElementById('bajada').textContent = TEXTOS[paso][1];
    }
    const foco = document.querySelector(`.paso[data-paso="${paso}"] .opcion, .paso[data-paso="${paso}"] textarea`);
    if (foco && paso !== 'comentario') foco.focus({ preventScroll: true });
    vigilar();
  }

  // Vuelve al inicio y borra lo contestado.
  function reiniciar() {
    respuesta = null;
    visor.value = '';
    comentario.value = '';
    actualizarContador();
    document.getElementById('ficha').textContent = '';
    mensajeNumero.textContent = TEXTO_AYUDA;
    mensajeNumero.classList.remove('error');
    actualizarVisor();
    clearInterval(cuentaRegresiva);
    mostrar('numero');
  }

  // ---------- Inactividad: 60 segundos sin tocar → inicio ----------
  function vigilar() {
    clearTimeout(temporizador);
    const paso = terminal.dataset.paso;
    if (paso === 'listo' || paso === 'cargando' || paso === 'sin-activar') return;
    if (paso === 'numero' && !visor.value) return;
    temporizador = setTimeout(reiniciar, segundosInactividad * 1000);
  }
  ['pointerdown', 'keydown', 'input'].forEach((e) => document.addEventListener(e, vigilar, { passive: true }));

  // ---------- Paso 1: número ----------
  function actualizarVisor() {
    continuar.disabled = visor.value.length !== 6;
    document.getElementById('visor-caja').classList.toggle('lleno', visor.value.length > 0);
  }
  function teclear(d) {
    if (terminal.dataset.paso !== 'numero') return;
    if (d === 'borrar') visor.value = visor.value.slice(0, -1);
    else if (d === 'limpiar') visor.value = '';
    else if (visor.value.length < 6) visor.value += d;
    mensajeNumero.classList.remove('error');
    mensajeNumero.textContent = TEXTO_AYUDA;
    actualizarVisor();
    vigilar();
  }
  document.getElementById('teclado').addEventListener('click', (e) => {
    const t = e.target.closest('.tecla');
    if (t) teclear(t.dataset.d ?? t.dataset.accion);
  });
  // Teclado físico (computadora o tableta con teclado).
  document.addEventListener('keydown', (e) => {
    if (terminal.dataset.paso !== 'numero') return;
    if (/^\d$/.test(e.key)) teclear(e.key);
    else if (e.key === 'Backspace') teclear('borrar');
    else if (e.key === 'Escape') teclear('limpiar');
    else if (e.key === 'Enter' && !e.target.closest('button')) document.getElementById('form-numero').requestSubmit();
  });

  document.getElementById('form-numero').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (visor.value.length !== 6) return;
    ocupado(continuar, true);
    try {
      const { cotizacion } = await pedir('/validar', { numero: visor.value });
      respuesta = { numero: cotizacion.numero };
      const ficha = document.getElementById('ficha');
      ficha.innerHTML = '<i class="bi bi-receipt" aria-hidden="true"></i><div><strong></strong><span></span></div>';
      ficha.querySelector('strong').textContent = `${cotizacion.numero} · ${cotizacion.cliente}`;
      ficha.querySelector('span').textContent = `Le atendió ${cotizacion.vendedor}`;
      mostrar('calificacion');
    } catch (error) {
      mensajeNumero.textContent = error.estado === 0 ? 'No hay conexión en este momento. Intente de nuevo en unos segundos.' : error.message;
      mensajeNumero.classList.add('error');
      if (error.estado === 401) return sinActivar();
    } finally {
      ocupado(continuar, false);
      actualizarVisor();
    }
  });

  // ---------- Paso 2: calificación, compra y motivo ----------
  document.getElementById('escala').addEventListener('click', (e) => {
    const b = e.target.closest('.opcion');
    if (!b || !respuesta) return;
    respuesta.calificacion = Number(b.dataset.valor);
    mostrar('compra');
  });

  document.querySelector('[data-paso="compra"]').addEventListener('click', (e) => {
    const b = e.target.closest('.opcion');
    if (!b || !respuesta) return;
    respuesta.compro = b.dataset.compro === 'si';
    respuesta.idMotivo = null;
    mostrar(respuesta.compro ? 'comentario' : 'motivo');
  });

  function pintarMotivos() {
    const lista = document.getElementById('motivos');
    lista.innerHTML = '';
    for (const m of motivos) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'opcion';
      b.dataset.id = m.id;
      b.textContent = m.descripcion;
      lista.appendChild(b);
    }
  }
  document.getElementById('motivos').addEventListener('click', (e) => {
    const b = e.target.closest('.opcion');
    if (!b || !respuesta) return;
    respuesta.idMotivo = Number(b.dataset.id);
    mostrar('comentario');
  });

  // ---------- Comentario y envío ----------
  function actualizarContador() {
    document.getElementById('contador-comentario').textContent = `${comentario.value.length} / 500`;
  }
  comentario.addEventListener('input', actualizarContador);

  document.getElementById('form-comentario').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!respuesta) return reiniciar();
    const datos = { ...respuesta, comentario: comentario.value.trim(), capturadaEn: new Date().toISOString() };
    const boton = document.getElementById('enviar');
    ocupado(boton, true);
    try {
      const r = await pedir('/respuestas', datos);
      terminar(r.caso, false);
    } catch (error) {
      if (error.estado === 0 || error.estado >= 500) {
        guardarPendiente(datos);
        terminar(null, true);
      } else if (error.estado === 401) {
        sinActivar();
      } else {
        // Ya calificada, anulada o vencida mientras contestaba: vuelve al inicio con el aviso.
        reiniciar();
        mensajeNumero.textContent = error.message;
        mensajeNumero.classList.add('error');
      }
    } finally {
      ocupado(boton, false);
    }
  });

  // ---------- Paso 3: listo ----------
  function terminar(caso, pendiente) {
    respuesta = null;
    const cajaCaso = document.getElementById('caso');
    cajaCaso.hidden = !caso;
    document.getElementById('texto-listo').textContent = pendiente
      ? 'Su respuesta quedó guardada en esta tableta y se enviará en cuanto vuelva la conexión.'
      : caso
        ? 'Lamentamos que su experiencia no haya sido buena. Daremos seguimiento a su caso.'
        : 'Su opinión nos ayuda a atenderle mejor.';
    if (caso) {
      document.getElementById('numero-caso').textContent = caso.numero;
      document.getElementById('plazo-caso').textContent = caso.plazo ? `Le contactaremos en un plazo máximo de ${caso.plazo}.` : '';
    }
    mostrar('listo');
    let restantes = SEGUNDOS_LISTO;
    const regreso = document.getElementById('regreso');
    regreso.textContent = `Volviendo al inicio en ${restantes} s`;
    clearInterval(cuentaRegresiva);
    cuentaRegresiva = setInterval(() => {
      restantes -= 1;
      regreso.textContent = `Volviendo al inicio en ${restantes} s`;
      if (restantes <= 0) reiniciar();
    }, 1000);
  }
  document.getElementById('terminar').addEventListener('click', reiniciar);

  // ---------- Respuestas guardadas sin conexión (RNF05) ----------
  function leerCola() {
    try { return JSON.parse(localStorage.getItem(COLA) || '[]'); } catch { return []; }
  }
  function escribirCola(cola) {
    try { localStorage.setItem(COLA, JSON.stringify(cola)); } catch { /* sin almacenamiento: se pierde */ }
    const aviso = document.getElementById('pendientes');
    aviso.hidden = cola.length === 0;
    aviso.textContent = cola.length ? `${cola.length} respuesta${cola.length > 1 ? 's' : ''} por enviar` : '';
  }
  function guardarPendiente(datos) {
    escribirCola([...leerCola(), datos]);
  }
  let enviando = false;
  async function enviarPendientes() {
    if (enviando) return;
    enviando = true;
    try {
      let cola = leerCola();
      for (const datos of [...cola]) {
        try {
          await pedir('/respuestas', datos);
        } catch (error) {
          if (error.estado === 0 || error.estado >= 500 || error.estado === 401) break; // se reintenta luego
          // 400/409: ya no se puede registrar (por ejemplo, ya se envió); se descarta.
        }
        cola = leerCola().filter((d) => !(d.numero === datos.numero && d.capturadaEn === datos.capturadaEn));
        escribirCola(cola);
      }
    } finally {
      enviando = false;
    }
  }
  window.addEventListener('online', enviarPendientes);
  setInterval(() => { if (leerCola().length) enviarPendientes(); }, 30000);

  // ---------- Utilidades ----------
  function ocupado(boton, activo) {
    boton.disabled = activo;
    if (activo) boton.setAttribute('aria-busy', 'true'); else boton.removeAttribute('aria-busy');
  }
  function sinActivar() {
    clearTimeout(temporizador);
    document.getElementById('titulo').textContent = 'Terminal de autoservicio';
    document.getElementById('bajada').textContent = 'Esta tableta todavía no está lista para la encuesta.';
    mostrar('sin-activar');
  }

  // ---------- Arranque ----------
  async function iniciar() {
    escribirCola(leerCola());
    try {
      const estado = await pedir('/estado');
      motivos = estado.motivos;
      segundosInactividad = estado.segundosInactividad || 60;
      pintarMotivos();
      reiniciar();
      enviarPendientes();
    } catch (error) {
      if (error.estado === 401) return sinActivar();
      document.getElementById('bajada').textContent = 'No hay conexión con el servidor. Reintentando…';
      setTimeout(iniciar, 5000);
    }
  }
  iniciar();
})();
