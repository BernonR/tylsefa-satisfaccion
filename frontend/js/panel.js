'use strict';

// Estructura común de las pantallas del personal: comprueba la sesión, arma el menú
// según los permisos del perfil (RS04) y cierra la sesión por inactividad (RS11).
(function () {
  // Módulos del sistema. "permisos": basta con tener uno; null = todos los perfiles.
  const MODULOS = [
    { id: 'inicio', texto: 'Inicio', icono: 'bi-house', href: 'inicio.html', permisos: null, listo: true },
    { id: 'cotizaciones', texto: 'Cotizaciones', icono: 'bi-receipt', href: 'cotizaciones.html', listo: false,
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
    { id: 'catalogos', texto: 'Catálogos', icono: 'bi-journal-bookmark', href: 'catalogos.html', listo: false,
      permisos: ['catalogos.consultar', 'catalogos.gestionar'],
      descripcion: 'Personal y empresas cliente de la sucursal.' },
    { id: 'usuarios', texto: 'Usuarios', icono: 'bi-people', href: 'usuarios.html', listo: false,
      permisos: ['usuarios.administrar'],
      descripcion: 'Cuentas de acceso y perfiles del personal.' },
  ];
  const PERFILES = { vendedor: 'Vendedor', supervisor: 'Supervisor', gerente: 'Gerente', administrador: 'Administrador' };

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

  window.Panel = { listo, MODULOS, PERFILES, permitido };
})();
