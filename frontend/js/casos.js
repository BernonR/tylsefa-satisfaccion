'use strict';

// M05 · Casos de servicio (CU-06). Bandeja con semáforo de plazos, detalle del caso,
// primer contacto, actuaciones y cierre autorizado según el segmento.
Panel.listo.then((yo) => {
  const principal = document.querySelector('.ty-principal');
  if (!Panel.tiene(yo, 'caso.atender')) {
    principal.innerHTML = '<div class="ty-vacio"><i class="bi bi-lock" aria-hidden="true"></i><h1 class="ty-subtitulo">Sin acceso</h1><p class="ty-secundario">Su perfil no tiene acceso a esta pantalla.</p></div>';
    return;
  }

  const { escapar, moneda, fecha, hora, nombreCorto } = UI;
  const cuerpo = document.querySelector('#tabla-casos tbody');
  const buscar = document.getElementById('buscar');
  const filtroEstado = document.getElementById('filtro-estado');
  const dialogo = document.getElementById('dialogo-caso');
  const modal = new bootstrap.Modal(dialogo);
  const contenido = document.getElementById('caso-cuerpo');
  const error = (e) => Tylsefa.aviso(e.message, 'bi-exclamation-circle-fill', 'var(--ty-error)');
  const ESCALA = { 1: 'Muy insatisfecho', 2: 'Insatisfecho', 3: 'Neutral', 4: 'Satisfecho', 5: 'Muy satisfecho' };
  let lista = [];
  let abierto = null;

  if (Panel.tiene(yo, 'caso.cerrar.mayorista')) {
    document.getElementById('subtitulo').textContent = 'Todos los casos de la sucursal. Los plazos corren en horas hábiles, de lunes a viernes de 8:00 a 17:00.';
  }

  const cuando = (iso) => `${fecha(iso)} · ${hora(iso)}`;
  // En la bandeja: solo la hora si es hoy; si no, día/mes y hora.
  const hoy = fecha(new Date().toISOString());
  const corto = (iso) => (fecha(iso) === hoy ? hora(iso) : `${fecha(iso).slice(0, 5)} · ${hora(iso)}`);

  function estado(c) {
    const e = {
      abierto: ['ty-estado-abierto', 'bi-circle', 'Sin contacto'],
      en_seguimiento: ['ty-estado-seguimiento', 'bi-telephone', 'En seguimiento'],
      escalado: ['ty-estado-escalado', 'bi-arrow-up-circle', 'Escalado'],
      cerrado: ['ty-estado-cerrado', 'bi-check-circle', 'Cerrado'],
    }[c.estado];
    const fue = c.escalado && c.estado !== 'escalado'
      ? ' <span class="ty-estado ty-estado-escalado ty-estado-mini" title="Se escaló porque venció el plazo de primer contacto"><i class="bi bi-arrow-up-circle" aria-hidden="true"></i>Escalado</span>' : '';
    return `<span class="ty-estado ${e[0]}"><i class="bi ${e[1]}" aria-hidden="true"></i>${e[2]}</span>${fue}`;
  }

  function plazo(c) {
    if (c.estado === 'cerrado') {
      return c.plazo === 'fuera_de_plazo'
        ? '<span class="ty-plazo tarde"><i class="bi bi-exclamation-triangle" aria-hidden="true"></i>Cerrado fuera de plazo</span>'
        : '<span class="ty-plazo bien"><i class="bi bi-check2" aria-hidden="true"></i>Dentro del plazo</span>';
    }
    const vence = c.contactado ? c.venceCierre : c.venceContacto;
    const que = c.contactado ? 'Cierre' : 'Contacto';
    return c.plazo === 'vencido'
      ? `<span class="ty-plazo tarde" title="Venció el ${escapar(cuando(vence))}"><i class="bi bi-alarm" aria-hidden="true"></i>${que} vencido</span>`
      : `<span class="ty-plazo" title="${escapar(cuando(vence))}"><i class="bi bi-clock" aria-hidden="true"></i>${que}: ${escapar(corto(vence))}</span>`;
  }

  const calificacion = (n) => `<span class="ty-nota n${n}" title="${ESCALA[n]}">${n}<small>/5</small></span>`;

  function pintar() {
    const pendientes = lista.filter((c) => c.estado !== 'cerrado');
    document.getElementById('k-abiertos').textContent = lista.filter((c) => c.estado === 'abierto').length;
    document.getElementById('k-seguimiento').textContent = lista.filter((c) => c.estado === 'en_seguimiento').length;
    // Escalados: casos pendientes cuyo plazo de primer contacto venció, aunque ya tengan contacto.
    document.getElementById('k-escalados').textContent = pendientes.filter((c) => c.escalado).length;
    document.getElementById('k-expuesto').textContent = moneda(pendientes.filter((c) => !c.esPrueba).reduce((t, c) => t + c.monto, 0));
    document.getElementById('resumen').textContent = `${lista.length} casos`;
    if (!lista.length) {
      cuerpo.innerHTML = '<tr><td colspan="6"><div class="ty-vacio"><i class="bi bi-emoji-smile" aria-hidden="true"></i><p class="ty-secundario mb-0">No hay casos con esos filtros.</p></div></td></tr>';
      return;
    }
    cuerpo.innerHTML = lista.map((c) => `
      <tr class="ty-fila-accion${c.estado === 'cerrado' ? ' inactivo' : ''}" data-id="${c.id}" tabindex="0" aria-label="Abrir ${escapar(c.numero)}">
        <td class="caso"><div class="ty-cifra principal">${escapar(c.numero)}${c.esPrueba ? '<span class="ty-etiqueta-prueba">Prueba</span>' : ''}</div><div class="mt-1">${estado(c)}</div></td>
        <td class="cliente"><div class="principal">${escapar(c.cliente)}</div><div class="ty-leyenda">${escapar(c.codigoCliente)} · ${c.segmento === 'mayorista' ? 'Mayorista' : 'Minorista'}</div></td>
        <td class="nota">${calificacion(c.calificacion)}</td>
        <td class="num ty-cifra monto">${escapar(moneda(c.monto))}</td>
        <td class="responsable" data-etiqueta="Responsable" title="${escapar(c.responsable)}">${escapar(nombreCorto(c.responsable))}</td>
        <td class="plazo">${plazo(c)}<div class="ty-leyenda">Creado ${escapar(corto(c.creado))}</div></td>
      </tr>`).join('');
  }

  async function cargar() {
    const p = new URLSearchParams({ estado: filtroEstado.value, buscar: buscar.value.trim() });
    lista = (await Api.pedir(`/api/casos?${p}`)).casos;
    if (filtroEstado.value === 'pendientes' && !buscar.value.trim()) Panel.cuentaMenu('casos', lista.length);
    pintar();
  }
  const recargar = () => cargar().catch(error);

  // ---------- Detalle ----------
  function dato(etiqueta, valor) {
    return `<div class="dato"><dt>${etiqueta}</dt><dd>${valor}</dd></div>`;
  }

  function formulario(id, etiqueta, nombre, boton, clase = 'btn-ty-primario', ayuda = '') {
    return `
      <form class="ty-accion-caso" id="${id}" novalidate>
        <label class="form-label" for="${id}-texto">${etiqueta}</label>
        <textarea class="form-control" id="${id}-texto" name="${nombre}" rows="3" maxlength="1000" required></textarea>
        ${ayuda ? `<div class="form-text">${ayuda}</div>` : ''}
        <div class="mt-2"><button type="submit" class="btn ${clase}">${boton}</button></div>
      </form>`;
  }

  function pintarDetalle(c) {
    document.getElementById('dialogo-caso-titulo').textContent = c.numero;
    document.getElementById('caso-estado').innerHTML = estado(c) + (c.esPrueba ? '<span class="ty-etiqueta-prueba">Prueba</span>' : '');
    const comentario = c.comentario ? `<blockquote class="ty-cita">“${escapar(c.comentario)}”</blockquote>` : '<span class="ty-secundario">Sin comentario</span>';
    const vendedor = c.acuseVendedor
      ? `Enterado el ${escapar(cuando(c.acuseVendedor))}${c.coachingConfirmado ? ` · coaching confirmado el ${escapar(cuando(c.coachingConfirmado))}` : ''}`
      : 'Aún no marca Enterado';
    // Lo interno (actuaciones) y lo que ve el cliente (resolución) se distinguen con un aviso claro.
    const interno = '<span class="ty-alcance interno"><i class="bi bi-lock" aria-hidden="true"></i>Solo uso interno: el cliente no lo ve</span>';
    const alCliente = '<span class="ty-alcance cliente"><i class="bi bi-envelope" aria-hidden="true"></i>Este texto se envía al cliente por correo</span>';
    const actuacion = () => formulario('f-actuacion', `Agregar actuación ${interno}`, 'descripcion', '<i class="bi bi-plus-lg" aria-hidden="true"></i>Agregar', 'btn-ty-secundario', 'Llamadas, acuerdos o coaching al vendedor. Queda en el historial del caso.');
    let acciones = '';
    if (c.estado !== 'cerrado') {
      if (!c.contactado) {
        if (c.puedeContactar) {
          acciones += formulario('f-contacto', `Registrar primer contacto ${interno}`, 'nota', '<i class="bi bi-telephone" aria-hidden="true"></i>Registrar contacto', 'btn-ty-primario', 'Cómo contactó al cliente y qué se acordó.');
        } else {
          acciones += '<p class="ty-mensaje info mb-0"><i class="bi bi-info-circle" aria-hidden="true"></i>Cliente mayorista: el primer contacto y el cierre los registra la gerencia. Usted puede dejar actuaciones internas.</p>';
          acciones += actuacion();
        }
      } else {
        acciones += actuacion();
        acciones += c.puedeCerrar
          ? formulario('f-cierre', `Cerrar el caso ${alCliente}`, 'resolucion', '<i class="bi bi-check2-circle" aria-hidden="true"></i>Cerrar caso', 'btn-ty-primario', 'Escriba la resolución pensando en el cliente: la recibirá tal como la escriba. Las actuaciones del historial no se le envían.')
          : '<p class="ty-mensaje info mb-0"><i class="bi bi-info-circle" aria-hidden="true"></i>Los casos de clientes mayoristas los cierra la gerencia.</p>';
      }
    }
    contenido.innerHTML = `
      <div class="ty-caso-grid">
        <section>
          <h3 class="ty-leyenda-titulo">Cliente y calificación</h3>
          <dl class="ty-datos">
            ${dato('Empresa', `${escapar(c.cliente)} <span class="ty-leyenda">${escapar(c.codigoCliente)} · ${c.segmento === 'mayorista' ? 'Mayorista' : 'Minorista'}</span>`)}
            ${c.contacto ? dato('Contacto', escapar(c.contacto)) : ''}
            ${dato('Correo', c.correoCliente ? `<a href="mailto:${escapar(c.correoCliente)}">${escapar(c.correoCliente)}</a>` : '—')}
            ${dato('Calificación', `${calificacion(c.calificacion)} <span class="ty-secundario">${ESCALA[c.calificacion]}</span>`)}
            ${dato('Compró', c.compro ? 'Sí' : `No${c.motivo ? ` · ${escapar(c.motivo)}` : ''}`)}
            ${dato('Comentario', comentario)}
          </dl>
        </section>
        <section>
          <h3 class="ty-leyenda-titulo">Cotización y plazos</h3>
          <dl class="ty-datos">
            ${dato('Cotización', `${escapar(c.cotizacion)} · ${escapar(moneda(c.monto))}`)}
            ${dato('Vendedor', `${escapar(c.vendedor)}<div class="ty-leyenda">${vendedor}</div>`)}
            ${dato('Responsable', `${escapar(c.responsable)}${c.copia ? `<div class="ty-leyenda">Copia: ${escapar(c.copia)}</div>` : ''}`)}
            ${dato('Primer contacto', c.contactado ? `Hecho el ${escapar(cuando(c.contactado))}` : `Antes de ${escapar(cuando(c.venceContacto))}`)}
            ${dato('Cierre', c.cerrado ? `Cerrado el ${escapar(cuando(c.cerrado))}` : `Antes de ${escapar(cuando(c.venceCierre))}`)}
            ${c.escalado ? dato('Escalado', escapar(cuando(c.escalado))) : ''}
          </dl>
        </section>
      </div>
      ${c.resolucion ? `<div class="ty-resolucion"><h3 class="ty-leyenda-titulo">Resolución</h3><p class="mb-0">${escapar(c.resolucion)}</p></div>` : ''}
      <section class="mt-4">
        <h3 class="ty-leyenda-titulo">Historial</h3>
        <ol class="ty-historial">
          <li><span class="punto"></span><div><strong>Caso creado</strong> desde la terminal<div class="ty-leyenda">${escapar(cuando(c.creado))}</div></div></li>
          ${c.actuaciones.map((a) => `<li><span class="punto"></span><div>${escapar(a.descripcion)}<div class="ty-leyenda">${escapar(a.autor)} · ${escapar(cuando(a.fechaHora))}</div></div></li>`).join('')}
        </ol>
      </section>
      ${acciones ? `<section class="ty-acciones-caso">${acciones}</section>` : ''}`;
    conectarFormularios(c);
  }

  function conectarFormularios(c) {
    const enviar = (id, ruta, campo, confirmar) => {
      const f = document.getElementById(id);
      if (!f) return;
      f.addEventListener('submit', async (e) => {
        e.preventDefault();
        UI.limpiarErrores(f);
        if (confirmar && !(await UI.confirmar(confirmar))) return;
        const boton = f.querySelector('button[type="submit"]');
        UI.ocupado(boton, true);
        try {
          const r = await Api.pedir(`/api/casos/${c.id}/${ruta}`, { metodo: 'POST', datos: { [campo]: f.elements[campo].value } });
          Tylsefa.aviso(r.mensaje);
          await abrir(c.id);
          recargar();
        } catch (err) {
          if (err.errores) UI.mostrarErrores(f, err.errores); else error(err);
        } finally {
          UI.ocupado(boton, false);
        }
      });
    };
    enviar('f-contacto', 'contacto', 'nota');
    enviar('f-actuacion', 'actuaciones', 'descripcion');
    enviar('f-cierre', 'cerrar', 'resolucion', { titulo: `¿Cerrar ${c.numero}?`, texto: 'La resolución se enviará al cliente por correo tal como está escrita. Las actuaciones quedan solo en el registro interno. El caso ya no se podrá modificar.', boton: 'Cerrar y enviar al cliente' });
  }

  async function abrir(id) {
    abierto = (await Api.pedir(`/api/casos/${id}`)).caso;
    pintarDetalle(abierto);
    if (!dialogo.classList.contains('show')) modal.show();
  }

  function abrirFila(evento) {
    const fila = evento.target.closest('tr[data-id]');
    if (!fila) return;
    if (evento.type === 'keydown' && evento.key !== 'Enter' && evento.key !== ' ') return;
    evento.preventDefault();
    abrir(Number(fila.dataset.id)).catch(error);
  }
  cuerpo.addEventListener('click', abrirFila);
  cuerpo.addEventListener('keydown', abrirFila);

  buscar.addEventListener('input', UI.demorar(recargar, 250));
  filtroEstado.addEventListener('change', recargar);

  // casos.html?caso=12 abre el caso directamente (enlace de los avisos).
  const pedido = Number(new URLSearchParams(location.search).get('caso'));
  cargar().then(() => { if (pedido) abrir(pedido).catch(error); }).catch(error);
});
