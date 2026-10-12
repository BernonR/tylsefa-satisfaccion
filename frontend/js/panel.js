'use strict';

// Estructura común de las pantallas del personal: comprueba la sesión, arma el menú
// según los permisos del perfil (RS04) y cierra la sesión por inactividad (RS11).
(function () {
  // Módulos del sistema. "permisos": basta con tener uno; null = todos los perfiles.
  const MODULOS = [
    { id: 'inicio', texto: 'Inicio', icono: 'bi-house', href: 'inicio.html', permisos: null, listo: true },
    { id: 'cotizaciones', texto: 'Cotizaciones', icono: 'bi-receipt', href: 'cotizaciones.html', listo: true,
      permisos: ['cotizacion.registrar', 'cotizacion.consultar'],
      descripcion: 'Registrar las cotizaciones que el cliente califica en la terminal.' },
    { id: 'casos', texto: 'Casos de servicio', menu: 'Casos', icono: 'bi-life-preserver', href: 'casos.html', listo: false,
      permisos: ['caso.atender'],
      descripcion: 'Dar seguimiento a los clientes insatisfechos dentro del plazo.' },
    { id: 'retroalimentacion', texto: 'Retroalimentación', icono: 'bi-chat-square-text', href: 'retroalimentacion.html', listo: false,
      permisos: ['acuse.registrar'],
      descripcion: 'Leer y confirmar los comentarios de sus clientes.' },
    { id: 'indicadores', texto: 'Indicadores', icono: 'bi-graph-up', href: 'indicadores.html', listo: false,
      permisos: ['tablero.propio', 'tablero.equipo', 'tablero.sucursal'],
      descripcion: 'Satisfacción, tendencias y reportes del periodo.' },
    { id: 'catalogos', texto: 'Catálogos', icono: 'bi-journal-bookmark', href: 'catalogos.html', listo: true,
      permisos: ['catalogos.consultar', 'catalogos.gestionar'],
      descripcion: 'Personal y empresas cliente de la sucursal.' },
    { id: 'usuarios', texto: 'Usuarios', icono: 'bi-people', href: 'usuarios.html', listo: true,
      permisos: ['usuarios.administrar'],
      descripcion: 'Cuentas de acceso y perfiles del personal.' },
  ];
  const PERFILES = { vendedor: 'Vendedor', supervisor: 'Supervisor', gerente: 'Gerente', administrador: 'Administrador' };

  // ---------- Estructura común: barra móvil, menú lateral y avisos ----------
  // Cada pantalla solo trae su <main class="ty-principal">; el resto se arma aquí.
  function construirEstructura() {
    const principal = document.querySelector('main.ty-principal');
    if (!principal || document.querySelector('.ty-app')) return;
    const app = document.createElement('div');
    app.className = 'ty-app';
    app.innerHTML = `
      <header class="ty-barra-movil">
        <img class="logo" src="img/logo-tylsefa.png" alt="Tylsefa" width="698" height="283">
        <button class="btn btn-ty-secundario btn-ty-icono" type="button" data-bs-toggle="offcanvas" data-bs-target="#lateral" aria-controls="lateral" aria-label="Abrir menú">
          <i class="bi bi-list" aria-hidden="true"></i>
        </button>
      </header>
      <aside class="ty-lateral offcanvas-lg offcanvas-start" tabindex="-1" id="lateral" aria-label="Menú principal">
        <div class="offcanvas-body">
          <div class="d-flex align-items-center justify-content-between">
            <img class="logo" src="img/logo-tylsefa.png" alt="Tylsefa" width="698" height="283">
            <button type="button" class="btn-close btn-close-white d-lg-none" data-bs-dismiss="offcanvas" data-bs-target="#lateral" aria-label="Cerrar menú"></button>
          </div>
          <nav aria-label="Módulos"><ul class="ty-menu" id="menu"></ul></nav>
          <div class="ty-usuario">
            <span class="ty-avatar" data-usuario="iniciales" aria-hidden="true"></span>
            <div class="datos flex-grow-1">
              <div class="nombre" data-usuario="nombre"></div>
              <div class="ty-leyenda" data-usuario="perfil" id="perfil-usuario"></div>
            </div>
            <div class="acciones">
              <button type="button" class="btn btn-ty-texto" id="cambiar-clave" aria-label="Cambiar mi contraseña" title="Cambiar mi contraseña">
                <i class="bi bi-key" aria-hidden="true"></i>
              </button>
              <button type="button" class="btn btn-ty-texto" data-accion="salir" id="salir" aria-label="Cerrar sesión" title="Cerrar sesión">
                <i class="bi bi-box-arrow-right" aria-hidden="true"></i>
              </button>
            </div>
          </div>
        </div>
      </aside>`;
    principal.before(app);
    app.appendChild(principal);
    if (!document.querySelector('.ty-avisos')) {
      const avisos = document.createElement('div');
      avisos.className = 'ty-avisos';
      avisos.setAttribute('aria-live', 'polite');
      document.body.appendChild(avisos);
    }
  }
  construirEstructura();

  // ---------- Cambiar mi contraseña (todos los perfiles) ----------
  function prepararCambioDeClave() {
    const nodo = document.createElement('div');
    nodo.className = 'modal fade ty-dialogo';
    nodo.id = 'dialogo-clave';
    nodo.tabIndex = -1;
    nodo.setAttribute('aria-labelledby', 'dialogo-clave-titulo');
    nodo.innerHTML = `
      <div class="modal-dialog modal-dialog-centered"><form class="modal-content" novalidate>
        <div class="modal-header">
          <h2 class="modal-title" id="dialogo-clave-titulo">Cambiar mi contraseña</h2>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button>
        </div>
        <div class="modal-body">
          <div class="mb-3"><label class="form-label" for="clave-actual">Contraseña actual</label>
            <input class="form-control" type="password" id="clave-actual" name="actual" autocomplete="current-password" required></div>
          <div class="mb-3"><label class="form-label" for="clave-nueva">Nueva contraseña</label>
            <input class="form-control" type="password" id="clave-nueva" name="nueva" autocomplete="new-password" required aria-describedby="clave-nueva-ayuda">
            <div class="form-text" id="clave-nueva-ayuda">Mínimo 8 caracteres, con mayúscula, minúscula y número.</div></div>
          <div><label class="form-label" for="clave-repetir">Repita la nueva contraseña</label>
            <input class="form-control" type="password" id="clave-repetir" name="repetir" autocomplete="new-password" required></div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-ty-secundario" data-bs-dismiss="modal">Cancelar</button>
          <button type="submit" class="btn btn-ty-primario" id="guardar-clave">Cambiar contraseña</button>
        </div>
      </form></div>`;
    document.body.appendChild(nodo);
    const formulario = nodo.querySelector('form');
    const modal = new bootstrap.Modal(nodo);
    document.getElementById('cambiar-clave').addEventListener('click', () => {
      formulario.reset();
      UI.limpiarErrores(formulario);
      modal.show();
    });
    nodo.addEventListener('shown.bs.modal', () => formulario.actual.focus());
    formulario.addEventListener('submit', async (evento) => {
      evento.preventDefault();
      const { actual, nueva, repetir } = UI.datos(formulario);
      if (nueva !== repetir) { UI.mostrarErrores(formulario, { repetir: 'Las contraseñas no coinciden.' }); return; }
      const boton = document.getElementById('guardar-clave');
      UI.ocupado(boton, true);
      try {
        const r = await Api.pedir('/api/sesion/contrasena', { metodo: 'POST', datos: { actual, nueva } });
        modal.hide();
        Tylsefa.aviso(r.mensaje);
      } catch (error) {
        if (error.errores) UI.mostrarErrores(formulario, error.errores);
        else Tylsefa.aviso(error.message, 'bi-exclamation-circle-fill', 'var(--ty-error)');
      } finally {
        UI.ocupado(boton, false);
      }
    });
  }

  const permitido = (m, usuario) => !m.permisos || m.permisos.some((p) => usuario.permisos.includes(p));
  const pagina = document.body.dataset.pagina;

  function armarMenu(usuario) {
    const lista = document.getElementById('menu');
    lista.innerHTML = '';
    for (const m of MODULOS.filter((x) => permitido(x, usuario))) {
      const li = document.createElement('li');
      li.dataset.modulo = m.id;
      const contenido = `<i class="bi ${m.icono}" aria-hidden="true"></i><span>${m.menu || m.texto}</span>`;
      if (m.listo) {
        li.innerHTML = `<a href="${m.href}">${contenido}</a>`;
        if (m.id === pagina) li.firstElementChild.setAttribute('aria-current', 'page');
      } else {
        li.innerHTML = `<span aria-disabled="true">${contenido}<span class="pronto">Pronto</span></span>`;
      }
      lista.appendChild(li);
    }
  }

  function mostrarUsuario(usuario) {
    const nombre = `${usuario.nombres.split(' ')[0]} ${usuario.apellidos.split(' ')[0]}`;
    const iniciales = (usuario.nombres[0] + usuario.apellidos[0]).toUpperCase();
    document.querySelectorAll('[data-usuario="nombre"]').forEach((n) => { n.textContent = nombre; });
    document.querySelectorAll('[data-usuario="nombres"]').forEach((n) => { n.textContent = usuario.nombres.split(' ')[0]; });
    document.querySelectorAll('[data-usuario="perfil"]').forEach((n) => { n.textContent = PERFILES[usuario.perfil] || usuario.perfil; });
    document.querySelectorAll('[data-usuario="iniciales"]').forEach((n) => { n.textContent = iniciales; });
  }

  // ---------- Cierre de sesión ----------
  const canal = 'BroadcastChannel' in window ? new BroadcastChannel('tylsefa-sesion') : null;

  async function salir(motivo) {
    detenerVigilancia();
    try {
      await Api.pedir('/api/sesion' + (motivo === 'inactividad' ? '?motivo=inactividad' : ''), { metodo: 'DELETE', redirigir: false });
    } catch { /* aunque falle la red, la sesión vence sola en el servidor */ }
    canal?.postMessage({ tipo: 'cerrada', motivo });
    location.replace(`index.html?motivo=${motivo}`);
  }

  // ---------- Inactividad (RS11) ----------
  // Se avisa un minuto antes y se cierra al cumplirse el plazo. La actividad renueva
  // la sesión en el servidor como máximo una vez por minuto; la última actividad
  // siempre se envía, así el servidor nunca vence antes que la pantalla.
  let minutos = 15;
  let ultimaActividad = Date.now();
  let ultimaRenovacion = Date.now();
  let renovacionPendiente = null;
  let reloj = null;
  let alerta = null;
  let alertaAbierta = false;

  function renovar() {
    renovacionPendiente = null;
    ultimaRenovacion = Date.now();
    Api.pedir('/api/sesion/renovar', { metodo: 'POST' }).catch(() => {});
  }

  function actividad(desdeOtraPestana) {
    if (alertaAbierta) return; // con el aviso abierto se debe elegir una opción
    ultimaActividad = Date.now();
    if (desdeOtraPestana) return; // la otra pestaña ya renovó
    canal?.postMessage({ tipo: 'actividad', momento: ultimaActividad });
    const espera = 60_000 - (Date.now() - ultimaRenovacion);
    if (espera <= 0) renovar();
    else if (!renovacionPendiente) renovacionPendiente = setTimeout(renovar, espera);
  }

  function crearAlerta() {
    const nodo = document.createElement('div');
    nodo.className = 'modal fade ty-alerta';
    nodo.id = 'alerta-inactividad';
    nodo.tabIndex = -1;
    nodo.setAttribute('aria-labelledby', 'alerta-inactividad-titulo');
    nodo.setAttribute('aria-describedby', 'alerta-inactividad-texto');
    nodo.setAttribute('data-bs-backdrop', 'static');
    nodo.setAttribute('data-bs-keyboard', 'false');
    nodo.innerHTML = `
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
          <h2 id="alerta-inactividad-titulo">¿Sigue ahí?</h2>
          <p id="alerta-inactividad-texto">Por seguridad, su sesión se cerrará en <strong class="ty-tabular" id="cuenta-regresiva">60</strong> segundos.</p>
          <div class="acciones">
            <button type="button" class="btn btn-ty-primario" id="seguir-conectado">Seguir conectado</button>
            <button type="button" class="btn btn-ty-secundario" id="cerrar-ahora">Cerrar sesión</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(nodo);
    nodo.querySelector('#seguir-conectado').addEventListener('click', () => {
      alertaAbierta = false;
      alerta.hide();
      actividad(false);
      renovar();
    });
    nodo.querySelector('#cerrar-ahora').addEventListener('click', () => salir('salida'));
    return new bootstrap.Modal(nodo);
  }

  function revisar() {
    const inactivo = Date.now() - ultimaActividad;
    const limite = minutos * 60_000;
    if (inactivo >= limite) { salir('inactividad'); return; }
    if (inactivo >= limite - 60_000) {
      if (!alertaAbierta) { alertaAbierta = true; alerta.show(); }
      document.getElementById('cuenta-regresiva').textContent = Math.ceil((limite - inactivo) / 1000);
    } else if (alertaAbierta) {
      alertaAbierta = false; // otra pestaña tuvo actividad
      alerta.hide();
    }
  }

  function iniciarVigilancia() {
    alerta = crearAlerta();
    for (const evento of ['pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll']) {
      window.addEventListener(evento, () => actividad(false), { passive: true, capture: true });
    }
    canal?.addEventListener('message', ({ data }) => {
      if (data.tipo === 'actividad') { alertaAbierta = false; alerta.hide(); ultimaActividad = Math.max(ultimaActividad, data.momento); }
      if (data.tipo === 'cerrada') { detenerVigilancia(); location.replace(`index.html?motivo=${data.motivo}`); }
    });
    reloj = setInterval(revisar, 1000);
  }

  function detenerVigilancia() {
    clearInterval(reloj);
    clearTimeout(renovacionPendiente);
  }

  // ---------- Arranque ----------
  const listo = Api.pedir('/api/sesion').then(({ usuario, minutos: m }) => {
    minutos = m;
    armarMenu(usuario);
    mostrarUsuario(usuario);
    document.querySelectorAll('[data-accion="salir"]').forEach((b) => b.addEventListener('click', () => salir('salida')));
    prepararCambioDeClave();
    document.body.classList.remove('ty-pendiente');
    iniciarVigilancia();
    return usuario;
  });

  listo.catch((error) => {
    document.body.classList.remove('ty-pendiente');
    const principal = document.querySelector('.ty-principal');
    principal.innerHTML = `<div class="ty-vacio"><i class="bi bi-wifi-off" aria-hidden="true"></i><h1 class="ty-subtitulo">No se pudo cargar el panel</h1><p class="ty-secundario"></p><button type="button" class="btn btn-ty-primario" onclick="location.reload()">Intentar de nuevo</button></div>`;
    principal.querySelector('p').textContent = error.message;
  });

  const tiene = (usuario, ...permisos) => permisos.some((p) => usuario.permisos.includes(p));
  window.Panel = { listo, MODULOS, PERFILES, permitido, tiene };
})();
