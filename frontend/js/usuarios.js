'use strict';

// M02 · Usuarios: alta, edición, restablecimiento de contraseña y desactivación (solo administrador).
Panel.listo.then((yo) => {
  const principal = document.querySelector('.ty-principal');
  if (!Panel.tiene(yo, 'usuarios.administrar')) {
    principal.innerHTML = '<div class="ty-vacio"><i class="bi bi-lock" aria-hidden="true"></i><h1 class="ty-subtitulo">Sin acceso</h1><p class="ty-secundario">Su perfil no tiene acceso a esta pantalla.</p></div>';
    return;
  }

  const { escapar } = UI;
  const cuerpo = document.querySelector('#tabla-usuarios tbody');
  const buscar = document.getElementById('buscar');
  const filtroPerfil = document.getElementById('filtro-perfil');
  const resumen = document.getElementById('resumen');
  const dialogo = document.getElementById('dialogo-usuario');
  const formulario = dialogo.querySelector('form');
  const modal = new bootstrap.Modal(dialogo);
  const dialogoClave = document.getElementById('dialogo-restablecer');
  const formularioClave = dialogoClave.querySelector('form');
  const modalClave = new bootstrap.Modal(dialogoClave);
  let lista = [];
  let editando = null;
  let restableciendo = null;

  const estadoElegido = () => document.querySelector('input[name="estado"]:checked').value;

  function pintar() {
    const texto = buscar.value.trim().toLowerCase();
    const perfil = filtroPerfil.value;
    const estado = estadoElegido();
    const visibles = lista.filter((u) => (!perfil || u.perfil === perfil)
      && (estado === 'todos' || (estado === 'activos' ? u.activo : !u.activo))
      && (!texto || `${u.nombres} ${u.apellidos} ${u.correo}`.toLowerCase().includes(texto)));

    resumen.textContent = `${visibles.length} de ${lista.length} usuarios`;
    if (!visibles.length) {
      cuerpo.innerHTML = '<tr><td colspan="5"><div class="ty-vacio"><i class="bi bi-people" aria-hidden="true"></i><p class="ty-secundario mb-0">No hay usuarios con esos filtros.</p></div></td></tr>';
      return;
    }
    cuerpo.innerHTML = visibles.map((u) => {
      const nombre = `${u.nombres} ${u.apellidos}`;
      const propio = u.id === yo.id;
      return `<tr class="${u.activo ? '' : 'inactivo'}" data-id="${u.id}">
        <td><div class="principal">${escapar(nombre)}${propio ? ' <span class="ty-leyenda">(usted)</span>' : ''}</div><div class="ty-leyenda">${escapar(u.correo)}</div></td>
        <td>${escapar(Panel.PERFILES[u.perfil] || u.perfil)}</td>
        <td>${u.supervisor ? escapar(u.supervisor) : '<span class="ty-leyenda">—</span>'}</td>
        <td>${u.activo ? '<span class="ty-estado ty-estado-cerrado"><i class="bi bi-check-circle" aria-hidden="true"></i>Activo</span>' : '<span class="ty-estado ty-estado-neutro"><i class="bi bi-slash-circle" aria-hidden="true"></i>Inactivo</span>'}</td>
        <td class="acciones">
          <button type="button" class="btn btn-ty-texto" data-accion="editar" aria-label="Editar a ${escapar(nombre)}" title="Editar"><i class="bi bi-pencil" aria-hidden="true"></i></button>
          <button type="button" class="btn btn-ty-texto" data-accion="restablecer" aria-label="Restablecer la contraseña de ${escapar(nombre)}" title="Restablecer contraseña"><i class="bi bi-key" aria-hidden="true"></i></button>
          ${propio ? '' : u.activo
            ? `<button type="button" class="btn btn-ty-texto" data-accion="desactivar" aria-label="Desactivar a ${escapar(nombre)}" title="Desactivar"><i class="bi bi-person-dash" aria-hidden="true"></i></button>`
            : `<button type="button" class="btn btn-ty-texto" data-accion="activar" aria-label="Activar a ${escapar(nombre)}" title="Activar"><i class="bi bi-person-check" aria-hidden="true"></i></button>`}
        </td>
      </tr>`;
    }).join('');
  }

  async function cargar() {
    cuerpo.innerHTML = '<tr><td colspan="5"><div class="ty-esqueleto" style="height:2.5rem"></div></td></tr>';
    lista = (await Api.pedir('/api/usuarios')).usuarios;
    pintar();
  }

  // ---------- Formulario de alta y edición ----------
  const campoSupervisor = document.getElementById('campo-supervisor');
  const campoClave = document.getElementById('campo-clave');
  const selectSupervisor = formulario.idSupervisor;

  function ajustarSupervisor() {
    campoSupervisor.hidden = formulario.perfil.value !== 'vendedor';
  }
  formulario.perfil.addEventListener('change', ajustarSupervisor);

  async function abrir(usuario = null) {
    editando = usuario;
    formulario.reset();
    UI.limpiarErrores(formulario);
    document.getElementById('dialogo-usuario-titulo').textContent = usuario ? 'Editar usuario' : 'Nuevo usuario';
    campoClave.hidden = Boolean(usuario);
    const { supervisores } = await Api.pedir('/api/usuarios/supervisores');
    selectSupervisor.innerHTML = '<option value="">Elija…</option>' + supervisores
      .filter((s) => !usuario || s.id !== usuario.id)
      .map((s) => `<option value="${s.id}">${escapar(s.nombre)}</option>`).join('');
    if (usuario) {
      formulario.nombres.value = usuario.nombres;
      formulario.apellidos.value = usuario.apellidos;
      formulario.correo.value = usuario.correo;
      formulario.perfil.value = usuario.perfil;
      selectSupervisor.value = usuario.idSupervisor || '';
    }
    formulario.perfil.disabled = Boolean(usuario && usuario.id === yo.id);
    ajustarSupervisor();
    modal.show();
  }
  dialogo.addEventListener('shown.bs.modal', () => formulario.nombres.focus());

  formulario.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const boton = document.getElementById('guardar-usuario');
    const datos = UI.datos(formulario);
    if (formulario.perfil.disabled) datos.perfil = formulario.perfil.value;
    UI.ocupado(boton, true);
    try {
      const r = editando
        ? await Api.pedir(`/api/usuarios/${editando.id}`, { metodo: 'PUT', datos })
        : await Api.pedir('/api/usuarios', { metodo: 'POST', datos });
      modal.hide();
      Tylsefa.aviso(r.mensaje);
      await cargar();
    } catch (error) {
      if (error.errores) UI.mostrarErrores(formulario, error.errores);
      else Tylsefa.aviso(error.message, 'bi-exclamation-circle-fill', 'var(--ty-error)');
    } finally {
      UI.ocupado(boton, false);
    }
  });

  // ---------- Restablecer contraseña ----------
  function abrirRestablecer(usuario) {
    restableciendo = usuario;
    formularioClave.reset();
    UI.limpiarErrores(formularioClave);
    document.getElementById('restablecer-para').textContent = `Escriba una contraseña temporal para ${usuario.nombres} ${usuario.apellidos}. La anterior dejará de funcionar.`;
    modalClave.show();
  }
  dialogoClave.addEventListener('shown.bs.modal', () => formularioClave.clave.focus());
  formularioClave.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const boton = document.getElementById('guardar-restablecer');
    UI.ocupado(boton, true);
    try {
      const r = await Api.pedir(`/api/usuarios/${restableciendo.id}/contrasena`, { metodo: 'POST', datos: UI.datos(formularioClave) });
      modalClave.hide();
      Tylsefa.aviso(r.mensaje);
    } catch (error) {
      if (error.errores) UI.mostrarErrores(formularioClave, error.errores);
      else Tylsefa.aviso(error.message, 'bi-exclamation-circle-fill', 'var(--ty-error)');
    } finally {
      UI.ocupado(boton, false);
    }
  });

  // ---------- Activar y desactivar ----------
  async function cambiarEstado(usuario, activo) {
    const nombre = `${usuario.nombres} ${usuario.apellidos}`;
    const acepta = await UI.confirmar(activo
      ? { titulo: `¿Activar a ${nombre}?`, texto: 'Podrá volver a iniciar sesión con su contraseña.', boton: 'Activar' }
      : { titulo: `¿Desactivar a ${nombre}?`, texto: 'Ya no podrá iniciar sesión. Su historial se conserva en la bitácora.', boton: 'Desactivar', peligro: true });
    if (!acepta) return;
    try {
      const r = await Api.pedir(`/api/usuarios/${usuario.id}/estado`, { metodo: 'PATCH', datos: { activo } });
      Tylsefa.aviso(r.mensaje);
      await cargar();
    } catch (error) {
      Tylsefa.aviso(error.message, 'bi-exclamation-circle-fill', 'var(--ty-error)');
    }
  }

  cuerpo.addEventListener('click', (evento) => {
    const boton = evento.target.closest('button[data-accion]');
    if (!boton) return;
    const usuario = lista.find((u) => u.id === Number(boton.closest('tr').dataset.id));
    const accion = boton.dataset.accion;
    if (accion === 'editar') abrir(usuario);
    if (accion === 'restablecer') abrirRestablecer(usuario);
    if (accion === 'desactivar') cambiarEstado(usuario, false);
    if (accion === 'activar') cambiarEstado(usuario, true);
  });

  document.querySelectorAll('[data-ver]').forEach((boton) => boton.addEventListener('click', () => {
    const campo = document.getElementById(boton.dataset.ver);
    const visible = campo.type === 'text';
    campo.type = visible ? 'password' : 'text';
    boton.setAttribute('aria-label', visible ? 'Mostrar contraseña' : 'Ocultar contraseña');
    boton.firstElementChild.className = visible ? 'bi bi-eye' : 'bi bi-eye-slash';
  }));

  document.getElementById('nuevo-usuario').addEventListener('click', () => abrir());
  buscar.addEventListener('input', UI.demorar(pintar, 150));
  filtroPerfil.addEventListener('change', pintar);
  document.querySelectorAll('input[name="estado"]').forEach((r) => r.addEventListener('change', pintar));
  cargar().catch((error) => Tylsefa.aviso(error.message, 'bi-exclamation-circle-fill', 'var(--ty-error)'));
});
