'use strict';

// M03 · Cotizaciones (CU-04). El supervisor registra, corrige mientras está pendiente y anula con motivo;
// el vendedor consulta solo las suyas; el gerente consulta todas.
Panel.listo.then((yo) => {
  const principal = document.querySelector('.ty-principal');
  if (!Panel.tiene(yo, 'cotizacion.consultar', 'cotizacion.registrar')) {
    principal.innerHTML = '<div class="ty-vacio"><i class="bi bi-lock" aria-hidden="true"></i><h1 class="ty-subtitulo">Sin acceso</h1><p class="ty-secundario">Su perfil no tiene acceso a esta pantalla.</p></div>';
    return;
  }

  const { escapar, moneda, fecha, hora, nombreCorto } = UI;
  const registra = Panel.tiene(yo, 'cotizacion.registrar');
  const cuerpo = document.querySelector('#tabla-cotizaciones tbody');
  const buscar = document.getElementById('buscar');
  const filtroEstado = document.getElementById('filtro-estado');
  const filtroDias = document.getElementById('filtro-dias');
  const esVendedor = yo.perfil === 'vendedor';
  const columnas = (registra ? 7 : 6) - (esVendedor ? 1 : 0);
  let lista = [];
  let opciones = null;
  let editando = null;
  let anulando = null;

  if (esVendedor) {
    document.querySelectorAll('#tabla-cotizaciones th')[3].remove(); // la columna Vendedor sobra: todas son suyas
    document.getElementById('titulo').textContent = 'Mis cotizaciones';
    document.getElementById('subtitulo').textContent = 'Las cotizaciones en las que usted atendió al cliente.';
  }
  document.getElementById('nueva-cotizacion').hidden = !registra;
  if (!registra) document.querySelector('#tabla-cotizaciones th.acciones').remove();

  function estado(c) {
    if (c.estado === 'anulada') return '<span class="ty-estado ty-estado-neutro"><i class="bi bi-slash-circle" aria-hidden="true"></i>Anulada</span>';
    if (c.estado === 'respondida') return '<span class="ty-estado ty-estado-cerrado"><i class="bi bi-check-circle" aria-hidden="true"></i>Calificada</span>';
    if (c.vencida) return '<span class="ty-estado ty-estado-seguimiento"><i class="bi bi-hourglass-bottom" aria-hidden="true"></i>Vencida</span>';
    return '<span class="ty-estado ty-estado-abierto"><i class="bi bi-circle" aria-hidden="true"></i>Pendiente</span>';
  }

  function pintar() {
    const reales = lista.filter((c) => !c.esPrueba && c.estado !== 'anulada');
    document.getElementById('k-pendientes').textContent = lista.filter((c) => c.estado === 'pendiente' && !c.vencida).length;
    document.getElementById('k-respondidas').textContent = lista.filter((c) => c.estado === 'respondida').length;
    document.getElementById('k-monto').textContent = moneda(reales.reduce((t, c) => t + c.monto, 0));
    document.getElementById('resumen').textContent = `${lista.length} cotizaciones`;

    if (!lista.length) {
      cuerpo.innerHTML = `<tr><td colspan="${columnas}"><div class="ty-vacio"><i class="bi bi-receipt" aria-hidden="true"></i><p class="ty-secundario mb-0">No hay cotizaciones con esos filtros.</p></div></td></tr>`;
      return;
    }
    cuerpo.innerHTML = lista.map((c) => `
      <tr class="${c.estado === 'anulada' ? 'inactivo' : ''}" data-id="${c.id}">
        <td class="ty-cifra principal">${escapar(c.numero)}${c.esPrueba ? '<span class="ty-etiqueta-prueba">Prueba</span>' : ''}</td>
        <td><div>${escapar(fecha(c.fechaHora))}</div><div class="ty-leyenda">${escapar(hora(c.fechaHora))}</div></td>
        <td><div class="principal">${escapar(c.cliente)}</div><div class="ty-leyenda">${escapar(c.codigoCliente)} · ${c.segmento === 'mayorista' ? 'Mayorista' : 'Minorista'}</div></td>
        ${esVendedor ? '' : `<td title="${escapar(c.vendedor)}">${escapar(nombreCorto(c.vendedor))}</td>`}
        <td class="num ty-cifra">${escapar(moneda(c.monto))}</td>
        <td>${estado(c)}${c.estado === 'anulada' && c.motivoAnulacion ? `<div class="ty-leyenda mt-1 motivo" title="${escapar(c.motivoAnulacion)}">${escapar(c.motivoAnulacion.slice(0, 40))}${c.motivoAnulacion.length > 40 ? '…' : ''}</div>` : ''}</td>
        ${registra ? `<td class="acciones">${c.estado === 'pendiente' ? `
          <button type="button" class="btn btn-ty-texto" data-accion="corregir" aria-label="Corregir ${escapar(c.numero)}" title="Corregir"><i class="bi bi-pencil" aria-hidden="true"></i></button>
          <button type="button" class="btn btn-ty-texto" data-accion="anular" aria-label="Anular ${escapar(c.numero)}" title="Anular"><i class="bi bi-x-circle" aria-hidden="true"></i></button>` : ''}</td>` : ''}
      </tr>`).join('');
  }

  async function cargar() {
    const parametros = new URLSearchParams({ buscar: buscar.value.trim(), estado: filtroEstado.value, dias: filtroDias.value });
    lista = (await Api.pedir(`/api/cotizaciones?${parametros}`)).cotizaciones;
    pintar();
  }
  const recargar = () => cargar().catch((error) => Tylsefa.aviso(error.message, 'bi-exclamation-circle-fill', 'var(--ty-error)'));

  // ---------- Registro y corrección ----------
  const dialogo = document.getElementById('dialogo-cotizacion');
  const formulario = dialogo.querySelector('form');
  const modal = new bootstrap.Modal(dialogo);
  const selectCliente = formulario.idCliente;
  const filtroCliente = document.getElementById('c-filtro-cliente');

  function pintarClientes(seleccion) {
    const texto = filtroCliente.value.trim().toLowerCase();
    const visibles = opciones.clientes.filter((c) => !texto || `${c.nombre} ${c.codigo}`.toLowerCase().includes(texto) || String(c.id) === String(seleccion));
    selectCliente.innerHTML = visibles.map((c) => `<option value="${c.id}">${escapar(c.nombre)} · ${escapar(c.codigo)} (${c.segmento === 'mayorista' ? 'Mayorista' : 'Minorista'})</option>`).join('');
    if (seleccion) selectCliente.value = String(seleccion);
  }
  filtroCliente.addEventListener('input', () => pintarClientes(selectCliente.value));

  async function abrir(cotizacion = null) {
    editando = cotizacion;
    formulario.reset();
    UI.limpiarErrores(formulario);
    opciones = await Api.pedir('/api/cotizaciones/opciones');
    formulario.idVendedor.innerHTML = '<option value="">Elija…</option>' + opciones.vendedores.map((v) => `<option value="${v.id}">${escapar(v.nombre)}</option>`).join('');
    pintarClientes(cotizacion?.idCliente);
    document.getElementById('dialogo-cotizacion-titulo').textContent = cotizacion ? `Corregir ${cotizacion.numero}` : 'Registrar cotización';
    document.getElementById('guardar-cotizacion').textContent = cotizacion ? 'Guardar corrección' : 'Registrar';
    if (cotizacion) {
      formulario.numero.value = cotizacion.numero.replace('COT-', '');
      formulario.monto.value = cotizacion.monto.toFixed(2);
      formulario.idVendedor.value = cotizacion.idVendedor;
      formulario.esPrueba.checked = cotizacion.esPrueba;
    }
    modal.show();
  }
  dialogo.addEventListener('shown.bs.modal', () => formulario.numero.focus());

  formulario.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const boton = document.getElementById('guardar-cotizacion');
    const datos = {
      numero: formulario.numero.value,
      monto: formulario.monto.value,
      idVendedor: formulario.idVendedor.value,
      idCliente: selectCliente.value,
      esPrueba: formulario.esPrueba.checked,
    };
    UI.ocupado(boton, true);
    try {
      const r = editando
        ? await Api.pedir(`/api/cotizaciones/${editando.id}`, { metodo: 'PUT', datos })
        : await Api.pedir('/api/cotizaciones', { metodo: 'POST', datos });
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

  // ---------- Anulación ----------
  const dialogoAnular = document.getElementById('dialogo-anular');
  const formularioAnular = dialogoAnular.querySelector('form');
  const modalAnular = new bootstrap.Modal(dialogoAnular);

  function abrirAnular(cotizacion) {
    anulando = cotizacion;
    formularioAnular.reset();
    UI.limpiarErrores(formularioAnular);
    document.getElementById('dialogo-anular-titulo').textContent = `Anular ${cotizacion.numero}`;
    document.getElementById('anular-texto').textContent = `${cotizacion.cliente} · ${moneda(cotizacion.monto)}. La terminal dejará de aceptarla. La cotización no se borra y queda en la bitácora.`;
    modalAnular.show();
  }
  dialogoAnular.addEventListener('shown.bs.modal', () => formularioAnular.motivo.focus());
  formularioAnular.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const boton = document.getElementById('confirmar-anular');
    UI.ocupado(boton, true, 'Anulando');
    try {
      const r = await Api.pedir(`/api/cotizaciones/${anulando.id}/anular`, { metodo: 'POST', datos: UI.datos(formularioAnular) });
      modalAnular.hide();
      Tylsefa.aviso(r.mensaje);
      await cargar();
    } catch (error) {
      if (error.errores) UI.mostrarErrores(formularioAnular, error.errores);
      else Tylsefa.aviso(error.message, 'bi-exclamation-circle-fill', 'var(--ty-error)');
    } finally {
      UI.ocupado(boton, false);
    }
  });

  cuerpo.addEventListener('click', (evento) => {
    const boton = evento.target.closest('button[data-accion]');
    if (!boton) return;
    const cotizacion = lista.find((c) => c.id === Number(boton.closest('tr').dataset.id));
    if (boton.dataset.accion === 'corregir') abrir(cotizacion).catch((e) => Tylsefa.aviso(e.message, 'bi-exclamation-circle-fill', 'var(--ty-error)'));
    if (boton.dataset.accion === 'anular') abrirAnular(cotizacion);
  });

  document.getElementById('nueva-cotizacion').addEventListener('click', () => abrir().catch((e) => Tylsefa.aviso(e.message, 'bi-exclamation-circle-fill', 'var(--ty-error)')));
  buscar.addEventListener('input', UI.demorar(recargar, 250));
  filtroEstado.addEventListener('change', recargar);
  filtroDias.addEventListener('change', recargar);
  recargar();
});
