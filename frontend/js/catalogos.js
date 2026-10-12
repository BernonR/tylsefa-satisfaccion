'use strict';

// M02 · Catálogos: empresas cliente (gestiona el administrador; supervisor y gerente consultan)
// y personal de la sucursal en modo consulta.
Panel.listo.then((yo) => {
  const principal = document.querySelector('.ty-principal');
  if (!Panel.tiene(yo, 'catalogos.consultar', 'catalogos.gestionar')) {
    principal.innerHTML = '<div class="ty-vacio"><i class="bi bi-lock" aria-hidden="true"></i><h1 class="ty-subtitulo">Sin acceso</h1><p class="ty-secundario">Su perfil no tiene acceso a esta pantalla.</p></div>';
    return;
  }

  const { escapar } = UI;
  const gestiona = Panel.tiene(yo, 'catalogos.gestionar');
  const cuerpo = document.querySelector('#tabla-empresas tbody');
  const buscar = document.getElementById('buscar');
  const filtroSegmento = document.getElementById('filtro-segmento');
  const filtroEstado = document.getElementById('filtro-estado');
  const resumen = document.getElementById('resumen-empresas');
  const dialogo = document.getElementById('dialogo-empresa');
  const formulario = dialogo.querySelector('form');
  const modal = new bootstrap.Modal(dialogo);
  const columnas = gestiona ? 6 : 5;
  let empresas = [];
  let editando = null;

  // Quien solo consulta no ve botones de edición.
  document.getElementById('nueva-empresa').hidden = !gestiona;
  filtroEstado.hidden = !gestiona;
  if (!gestiona) document.querySelector('#tabla-empresas th.acciones').remove();

  const segmento = (s) => (s === 'mayorista'
    ? '<span class="ty-estado ty-estado-abierto">Mayorista</span>'
    : '<span class="ty-estado ty-estado-neutro">Minorista</span>');

  function pintar() {
    const minoristas = empresas.filter((e) => e.segmento === 'minorista').length;
    resumen.textContent = `${empresas.length} empresas · ${minoristas} minoristas · ${empresas.length - minoristas} mayoristas`;
    if (!empresas.length) {
      cuerpo.innerHTML = `<tr><td colspan="${columnas}"><div class="ty-vacio"><i class="bi bi-building" aria-hidden="true"></i><p class="ty-secundario mb-0">No hay empresas con esos filtros.</p></div></td></tr>`;
      return;
    }
    cuerpo.innerHTML = empresas.map((e) => `
      <tr class="${e.activo ? '' : 'inactivo'}" data-id="${e.id}">
        <td class="ty-cifra">${escapar(e.codigo)}</td>
        <td><div class="principal">${escapar(e.nombre)}</div>${e.contacto ? `<div class="ty-leyenda">${escapar(e.contacto)}</div>` : ''}</td>
        <td>${segmento(e.segmento)}</td>
        <td class="correo">${escapar(e.correo || '—')}</td>
        <td>${e.activo ? '<span class="ty-estado ty-estado-cerrado"><i class="bi bi-check-circle" aria-hidden="true"></i>Activa</span>' : '<span class="ty-estado ty-estado-neutro"><i class="bi bi-slash-circle" aria-hidden="true"></i>Inactiva</span>'}</td>
        ${gestiona ? `<td class="acciones">
          <button type="button" class="btn btn-ty-texto" data-accion="editar" aria-label="Editar ${escapar(e.nombre)}" title="Editar"><i class="bi bi-pencil" aria-hidden="true"></i></button>
          ${e.activo
            ? `<button type="button" class="btn btn-ty-texto" data-accion="desactivar" aria-label="Desactivar ${escapar(e.nombre)}" title="Desactivar"><i class="bi bi-slash-circle" aria-hidden="true"></i></button>`
            : `<button type="button" class="btn btn-ty-texto" data-accion="activar" aria-label="Activar ${escapar(e.nombre)}" title="Activar"><i class="bi bi-arrow-counterclockwise" aria-hidden="true"></i></button>`}
        </td>` : ''}
      </tr>`).join('');
  }

  async function cargar() {
    const parametros = new URLSearchParams({ buscar: buscar.value.trim(), segmento: filtroSegmento.value, estado: gestiona ? filtroEstado.value : 'activos' });
    empresas = (await Api.pedir(`/api/clientes?${parametros}`)).clientes;
    pintar();
  }
  const recargar = () => cargar().catch((error) => Tylsefa.aviso(error.message, 'bi-exclamation-circle-fill', 'var(--ty-error)'));

  // ---------- Alta y edición ----------
  function abrir(empresa = null) {
    editando = empresa;
    formulario.reset();
    UI.limpiarErrores(formulario);
    document.getElementById('dialogo-empresa-titulo').textContent = empresa ? 'Editar empresa cliente' : 'Nueva empresa cliente';
    document.getElementById('empresa-codigo').textContent = empresa ? `Código ${empresa.codigo}` : 'El código se asigna al guardar.';
    if (empresa) {
      formulario.nombre.value = empresa.nombre;
      formulario.segmento.value = empresa.segmento;
      formulario.nit.value = empresa.nit || '';
      formulario.correo.value = empresa.correo || '';
      formulario.contacto.value = empresa.contacto || '';
    }
    modal.show();
  }
  dialogo.addEventListener('shown.bs.modal', () => formulario.nombre.focus());

  formulario.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const boton = document.getElementById('guardar-empresa');
    UI.ocupado(boton, true);
    try {
      const datos = UI.datos(formulario);
      const r = editando
        ? await Api.pedir(`/api/clientes/${editando.id}`, { metodo: 'PUT', datos })
        : await Api.pedir('/api/clientes', { metodo: 'POST', datos });
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

  async function cambiarEstado(empresa, activo) {
    const acepta = await UI.confirmar(activo
      ? { titulo: `¿Activar ${empresa.nombre}?`, texto: 'Volverá a aparecer al registrar cotizaciones.', boton: 'Activar' }
      : { titulo: `¿Desactivar ${empresa.nombre}?`, texto: 'Ya no aparecerá al registrar cotizaciones. Su historial se conserva.', boton: 'Desactivar', peligro: true });
    if (!acepta) return;
    try {
      const r = await Api.pedir(`/api/clientes/${empresa.id}/estado`, { metodo: 'PATCH', datos: { activo } });
      Tylsefa.aviso(r.mensaje);
      await cargar();
    } catch (error) {
      Tylsefa.aviso(error.message, 'bi-exclamation-circle-fill', 'var(--ty-error)');
    }
  }

  cuerpo.addEventListener('click', (evento) => {
    const boton = evento.target.closest('button[data-accion]');
    if (!boton) return;
    const empresa = empresas.find((e) => e.id === Number(boton.closest('tr').dataset.id));
    if (boton.dataset.accion === 'editar') abrir(empresa);
    if (boton.dataset.accion === 'desactivar') cambiarEstado(empresa, false);
    if (boton.dataset.accion === 'activar') cambiarEstado(empresa, true);
  });

  // ---------- Personal (consulta) ----------
  let personalCargado = false;
  async function cargarPersonal() {
    if (personalCargado) return;
    const { personal } = await Api.pedir('/api/personal');
    personalCargado = true;
    document.getElementById('resumen-personal').textContent = `${personal.length} personas activas`;
    document.querySelector('#tabla-personal tbody').innerHTML = personal.map((p) => `
      <tr><td class="principal">${escapar(`${p.nombres} ${p.apellidos}`)}</td>
      <td>${escapar(Panel.PERFILES[p.perfil] || p.perfil)}</td>
      <td>${p.supervisor ? escapar(p.supervisor) : '<span class="ty-leyenda">—</span>'}</td>
      <td>${escapar(p.correo)}</td></tr>`).join('');
  }

  document.querySelectorAll('input[name="catalogo"]').forEach((opcion) => opcion.addEventListener('change', () => {
    const personal = opcion.value === 'personal' && opcion.checked;
    document.getElementById('seccion-personal').hidden = !personal;
    document.getElementById('seccion-empresas').hidden = personal;
    document.getElementById('nueva-empresa').hidden = personal || !gestiona;
    if (personal) cargarPersonal().catch((error) => Tylsefa.aviso(error.message, 'bi-exclamation-circle-fill', 'var(--ty-error)'));
  }));

  document.getElementById('nueva-empresa').addEventListener('click', () => abrir());
  buscar.addEventListener('input', UI.demorar(recargar, 250));
  filtroSegmento.addEventListener('change', recargar);
  filtroEstado.addEventListener('change', recargar);
  recargar();
});
