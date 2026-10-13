'use strict';

// M06 · Tablero de indicadores (RF13). El servidor decide el alcance según el perfil:
// vendedor (sus interacciones), supervisor (su equipo) o gerencia (toda la sucursal).
Panel.listo.then((yo) => {
  const principal = document.querySelector('.ty-principal');
  if (!['tablero.propio', 'tablero.equipo', 'tablero.sucursal'].some((p) => Panel.tiene(yo, p))) {
    principal.innerHTML = '<div class="ty-vacio"><i class="bi bi-lock" aria-hidden="true"></i><h1 class="ty-subtitulo">Sin acceso</h1><p class="ty-secundario">Su perfil no tiene acceso a esta pantalla.</p></div>';
    return;
  }

  const { escapar, moneda } = UI;
  const $ = (id) => document.getElementById(id);
  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const SUBTITULOS = {
    sucursal: 'Resultados de la sucursal en el periodo seleccionado.',
    equipo: 'Resultados de los vendedores a su cargo en el periodo seleccionado.',
    propio: 'Resultados de los clientes que usted atendió en el periodo seleccionado.',
  };
  const numero = (v, d = 1) => new Intl.NumberFormat('es-GT', { minimumFractionDigits: d, maximumFractionDigits: d }).format(v);
  const porcentaje = (v) => (v === null || v === undefined ? '—' : `${numero(v)} %`);
  const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
  // Nombres cortos de los motivos para la gráfica (el texto completo es el que ve el cliente).
  const CORTOS = [[/precio/, 'Precio'], [/disponible/, 'No disponible'], [/pago/, 'Condiciones de pago'],
    [/entrega/, 'Tiempo de entrega'], [/compar/, 'Solo comparaba'], [/^otro/, 'Otro motivo']];
  const corto = (texto) => {
    const t = texto.toLowerCase();
    return (CORTOS.find(([patron]) => patron.test(t)) || [null, texto])[1];
  };
  function duracion(min) {
    if (min === null || min === undefined) return '—';
    if (min < 60) return `${min} min`;
    const h = Math.floor(min / 60); const m = min % 60;
    return m ? `${h} h ${m} min` : `${h} h`;
  }

  // ---------- Periodo: los últimos doce meses y un rango libre ----------
  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guatemala' }).format(new Date()); // AAAA-MM-DD
  const [anio, mes] = hoy.split('-').map(Number);
  const iso = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const selPeriodo = $('f-periodo');
  for (let i = 0; i < 12; i++) {
    const fecha = new Date(Date.UTC(anio, mes - 1 - i, 1));
    const y = fecha.getUTCFullYear(); const m = fecha.getUTCMonth() + 1;
    const ultimo = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const texto = `${MESES[m - 1].charAt(0).toUpperCase()}${MESES[m - 1].slice(1)} de ${y}`;
    selPeriodo.add(new Option(i === 0 ? `${texto} (en curso)` : texto, `${iso(y, m, 1)}|${iso(y, m, ultimo)}`));
  }
  selPeriodo.add(new Option('Hoy', `${hoy}|${hoy}`));
  selPeriodo.add(new Option('Rango de fechas…', 'rango'));
  $('f-desde').value = `${hoy.slice(0, 8)}01`;
  $('f-hasta').value = hoy;
  $('f-desde').max = hoy; $('f-hasta').max = hoy;

  function periodo() {
    if (selPeriodo.value !== 'rango') {
      const [desde, hasta] = selPeriodo.value.split('|');
      return { desde, hasta };
    }
    return { desde: $('f-desde').value, hasta: $('f-hasta').value };
  }

  // ---------- Carga ----------
  const tablero = $('tablero');
  let primera = true;
  let peticion = 0;
  let vistaMotivos = 'cantidad';
  let ultimos = null;

  function pintarMotivos(k) {
    const g = lienzo('g-motivos');
    if (!k.motivos.length) { vacio(g, k.respuestas ? 'Todos los clientes del periodo compraron.' : 'Aún no hay respuestas en este periodo.'); return; }
    const porMonto = vistaMotivos === 'monto';
    const lista = [...k.motivos].sort((a, b) => (porMonto ? b.monto - a.monto : b.cantidad - a.cantidad));
    Graficas.barras(g, {
      etiquetas: lista.map((m) => corto(m.motivo)), valores: lista.map((m) => (porMonto ? m.monto : m.cantidad)),
      prefijo: porMonto ? 'Q ' : '', horizontal: true, fila: 36,
      titulo: porMonto ? 'Monto cotizado que no se vendió, por motivo' : 'Motivos de no compra',
    });
    revelar(g);
  }

  async function cargar() {
    const { desde, hasta } = periodo();
    if (!desde || !hasta) { Tylsefa.aviso('Indique la fecha inicial y la final.', 'bi-exclamation-circle-fill', 'var(--ty-error)'); return; }
    const parametros = new URLSearchParams({ desde, hasta });
    if ($('f-segmento').value) parametros.set('segmento', $('f-segmento').value);
    if ($('f-vendedor').value) parametros.set('vendedor', $('f-vendedor').value);
    if ($('f-pruebas').checked) parametros.set('pruebas', '1');
    const esta = ++peticion;
    tablero.setAttribute('aria-busy', 'true');
    try {
      const datos = await Api.pedir(`/api/indicadores?${parametros}`);
      if (esta !== peticion) return; // llegó una respuesta más nueva
      if (primera) prepararFiltros(datos);
      primera = false;
      pintar(datos);
    } catch (error) {
      Tylsefa.aviso(error.message, 'bi-exclamation-circle-fill', 'var(--ty-error)');
    } finally {
      if (esta === peticion) tablero.setAttribute('aria-busy', 'false');
    }
  }

  function prepararFiltros(datos) {
    $('subtitulo').textContent = SUBTITULOS[datos.alcance];
    if (datos.alcance !== 'propio') {
      $('caja-vendedor').hidden = false;
      for (const v of datos.vendedores) $('f-vendedor').add(new Option(v.activo ? v.nombre : `${v.nombre} (inactivo)`, v.id));
    } else {
      $('panel-vendedores').hidden = true;
    }
    $('caja-pruebas').hidden = !datos.puedeIncluirPruebas;
  }

  // ---------- Pintado ----------
  function cambio(nodo, puntos, menosEsMejor) {
    nodo.className = 'cambio';
    if (puntos === null || puntos === undefined) { nodo.textContent = 'Sin datos del periodo anterior para comparar'; return; }
    if (Math.abs(puntos) < 0.05) { nodo.innerHTML = '<i class="bi bi-dash" aria-hidden="true"></i>Igual que el periodo anterior'; return; }
    const sube = puntos > 0;
    nodo.classList.add((sube !== menosEsMejor) ? 'mejora' : 'empeora');
    nodo.innerHTML = `<i class="bi ${sube ? 'bi-arrow-up-short' : 'bi-arrow-down-short'}" aria-hidden="true"></i>${numero(Math.abs(puntos))} puntos ${sube ? 'más' : 'menos'} que el periodo anterior`;
  }

  // Cada gráfica se dibuja en un contenedor nuevo para no acumular observadores.
  function lienzo(id) {
    const viejo = $(id);
    const nuevo = viejo.cloneNode(false);
    viejo.replaceWith(nuevo);
    return nuevo;
  }
  const vacio = (contenedor, texto) => {
    contenedor.innerHTML = `<div class="ty-vacio compacto"><i class="bi bi-bar-chart" aria-hidden="true"></i><p class="ty-secundario mb-0">${texto}</p></div>`;
  };
  const revelar = (contenedor) => requestAnimationFrame(() => requestAnimationFrame(() => contenedor.classList.add('visible')));

  function pintar({ indicadores: k, filtros, alcance }) {
    ultimos = k;
    $('aviso-pruebas').hidden = !filtros.pruebas;
    $('pie').textContent = filtros.pruebas
      ? 'Los indicadores incluyen los registros de prueba porque el interruptor está encendido.'
      : 'Los indicadores se calculan con las respuestas de la terminal de autoservicio y excluyen los registros de prueba.';

    // Tarjetas principales
    $('k-satisfechos').textContent = porcentaje(k.satisfechos);
    $('k-satisfechos-detalle').textContent = k.promedio === null ? 'Calificación 4 o 5' : `Promedio ${numero(k.promedio)} de 5`;
    cambio($('k-satisfechos-cambio'), k.respuestas ? k.comparacion?.satisfechos : undefined, false);
    $('k-insatisfechos').textContent = porcentaje(k.insatisfechos);
    $('k-insatisfechos-detalle').textContent = k.insatisfaccionPonderada === null
      ? 'Calificación 1 o 2'
      : `Ponderada por monto: ${porcentaje(k.insatisfaccionPonderada)}`;
    cambio($('k-insatisfechos-cambio'), k.respuestas ? k.comparacion?.insatisfechos : undefined, true);
    $('k-plazo').textContent = porcentaje(k.casos.porcentaje);
    $('k-plazo-detalle').textContent = k.casos.total
      ? `${k.casos.enPlazo} de ${k.casos.enPlazo + k.casos.vencidos} evaluados · ${plural(k.casos.vencidos, 'vencido', 'vencidos')}${k.casos.enCurso ? ` · ${k.casos.enCurso} en curso` : ''}`
      : 'Sin casos en el periodo';
    $('k-respuestas').textContent = numero(k.respuestas, 0);
    $('k-respuestas-detalle').textContent = k.cotizaciones
      ? `Tasa de respuesta ${porcentaje(k.tasaRespuesta)} de ${plural(k.cotizaciones, 'cotización', 'cotizaciones')}`
      : 'Sin cotizaciones registradas en el periodo';

    // Tendencia
    const gTendencia = lienzo('g-tendencia');
    if (k.tendencia.length) {
      Graficas.linea(gTendencia, {
        etiquetas: k.tendencia.map((t) => t.etiqueta), valores: k.tendencia.map((t) => t.valor),
        sufijo: ' %', decimales: 1, minimo: 0, maximo: 100, alto: 220, titulo: 'Clientes satisfechos por periodo',
      });
      revelar(gTendencia);
    } else vacio(gTendencia, 'Aún no hay respuestas en este periodo.');
    const { desde, hasta } = periodo();
    const dias = (Date.parse(hasta) - Date.parse(desde)) / 86400000 + 1;
    $('t-tendencia-detalle').textContent = `Porcentaje de respuestas con calificación 4 o 5, por ${dias <= 14 ? 'día' : dias <= 120 ? 'semana' : 'mes'}`;

    // Ingreso expuesto
    $('k-expuesto').textContent = `Q ${numero(k.expuesto.total, 0)}`;
    $('k-expuesto-detalle').textContent = k.expuesto.porcentaje === null
      ? 'Sin cotizaciones en el periodo'
      : `${porcentaje(k.expuesto.porcentaje)} del total cotizado (${moneda(k.expuesto.totalCotizado)})`;
    $('k-expuesto-segmentos').innerHTML = ['mayorista', 'minorista'].map((s) => `
      <div><dt>${s === 'mayorista' ? 'Mayorista' : 'Minorista'}</dt><dd class="ty-cifra">${moneda(k.expuesto[s])}</dd></div>`).join('');

    // Reparto de calificaciones: 1 y 2 en el color de alerta, 3 neutro, 4 y 5 en el de marca
    const gReparto = lienzo('g-reparto');
    if (k.respuestas) {
      const css = getComputedStyle(gReparto);
      const malo = css.getPropertyValue('--gr-malo').trim();
      const neutro = css.getPropertyValue('--gr-neutro').trim();
      const bueno = css.getPropertyValue('--gr-serie-1').trim();
      Graficas.barras(gReparto, {
        etiquetas: ['1', '2', '3', '4', '5'],
        valores: k.reparto, colores: [malo, malo, neutro, bueno, bueno], alto: 220, titulo: 'Respuestas por calificación',
      });
      revelar(gReparto);
    } else vacio(gReparto, 'Aún no hay respuestas en este periodo.');

    // Motivos de no compra: por cantidad de veces o por monto cotizado que no se vendió
    $('t-motivos-detalle').textContent = k.respuestas
      ? `${plural(k.compra.sinCompra, 'interacción', 'interacciones')} sin compra · tasa de compra ${porcentaje(k.compra.tasa)}`
      : 'Lo que indicó el cliente cuando no compró';
    pintarMotivos(k);

    // Satisfacción y compra
    const gCompra = lienzo('g-compra-nota');
    const conRespuestas = k.compraPorNota.filter((x) => x.respuestas);
    if (conRespuestas.length) {
      const css = getComputedStyle(gCompra);
      const malo = css.getPropertyValue('--gr-malo').trim();
      const neutro = css.getPropertyValue('--gr-neutro').trim();
      const bueno = css.getPropertyValue('--gr-serie-1').trim();
      Graficas.barras(gCompra, {
        etiquetas: ['1', '2', '3', '4', '5'], valores: k.compraPorNota.map((x) => x.tasa ?? 0), sufijo: ' %', maximo: 100,
        colores: [malo, malo, neutro, bueno, bueno], alto: 220, titulo: 'Tasa de compra por calificación',
      });
      revelar(gCompra);
      const tasa = (lista) => {
        const r = lista.reduce((t, x) => t + x.respuestas, 0);
        return r ? lista.reduce((t, x) => t + (x.tasa ?? 0) * x.respuestas, 0) / r : null;
      };
      const altos = tasa(k.compraPorNota.slice(3));
      const bajos = tasa(k.compraPorNota.slice(0, 2));
      $('t-compra-nota-lectura').textContent = altos !== null && bajos !== null
        ? `Compró el ${porcentaje(altos)} de los satisfechos (4 y 5) frente al ${porcentaje(bajos)} de los insatisfechos (1 y 2).`
        : 'La comparación aparece cuando hay clientes satisfechos e insatisfechos en el periodo.';
    } else {
      vacio(gCompra, 'Aún no hay respuestas en este periodo.');
      $('t-compra-nota-lectura').textContent = '';
    }

    // Minorista y mayorista
    const filasSegmento = [
      ['Respuestas', (s) => numero(s.respuestas, 0)],
      ['Satisfechos', (s) => porcentaje(s.satisfechos)],
      ['Insatisfechos', (s) => porcentaje(s.insatisfechos)],
      ['Tasa de compra', (s) => porcentaje(s.tasaCompra)],
      ['Monto promedio cotizado', (s) => (s.montoPromedio === null ? '—' : `Q ${numero(s.montoPromedio, 0)}`)],
      ['Ingreso expuesto', (s) => `Q ${numero(s.expuesto, 0)}`],
    ];
    const [mino, mayo] = k.segmentos;
    $('tabla-segmentos').tBodies[0].innerHTML = filasSegmento.map(([nombre, valor]) => `
      <tr><th scope="row">${nombre}</th><td class="num">${valor(mino)}</td><td class="num">${valor(mayo)}</td></tr>`).join('');

    // Tiempo de primer contacto, por segmento
    $('contacto').innerHTML = k.contacto.map((c) => `
      <div>
        <dt>${c.segmento === 'mayorista' ? 'Mayorista' : 'Minorista'} <span class="ty-leyenda">· ${plural(c.casos, 'caso', 'casos')}</span></dt>
        <dd><span class="cifra">${duracion(c.promedioMinutos)}</span>
          <span class="ty-leyenda">Plazo ${duracion(c.plazoMinutos)} · ${c.enPlazo === null ? 'sin casos evaluados' : `${porcentaje(c.enPlazo)} en plazo`}</span></dd>
      </div>`).join('');

    // Resultados por vendedor
    if (alcance !== 'propio') {
      $('tabla-vendedores').tBodies[0].innerHTML = k.vendedores.length ? k.vendedores.map((v) => `
        <tr>
          <td class="principal">${escapar(v.nombre)}<div class="ty-leyenda">Promedio ${numero(v.promedio)} de 5</div></td>
          <td class="num">${v.respuestas}</td>
          <td class="num">${porcentaje(v.satisfechos)}</td>
          <td class="num">${porcentaje(v.insatisfechos)}</td>
          <td class="num">${porcentaje(v.tasaCompra)}</td>
          <td class="num">${v.casos}</td>
          <td class="num">${v.casos ? porcentaje(v.enPlazo) : '—'}</td>
        </tr>`).join('')
        : '<tr><td colspan="7"><div class="ty-vacio compacto"><p class="ty-secundario mb-0">Aún no hay respuestas en este periodo.</p></div></td></tr>';
    }

    // Respuestas por día y hora: un solo tono, más intenso con más respuestas
    const maximo = Math.max(1, ...k.horario.celdas.flat().map((c) => c.respuestas));
    const nivel = (n) => (n ? Math.ceil((n / maximo) * 4) : 0);
    $('g-horario').innerHTML = `
      <div class="rejilla" style="--horas:${k.horario.horas.length}" role="table" aria-label="Respuestas por día de la semana y hora">
        <div role="row" class="fila"><span role="columnheader"></span>${k.horario.horas.map((h) => `<span role="columnheader" class="hora">${h}</span>`).join('')}</div>
        ${k.horario.dias.map((d, i) => `<div role="row" class="fila"><span role="rowheader" class="dia">${d}</span>${k.horario.celdas[i].map((c, j) => {
          const texto = `${d} ${k.horario.horas[j]}:00 · ${plural(c.respuestas, 'respuesta', 'respuestas')}${c.respuestas ? ` · ${numero((c.satisfechos / c.respuestas) * 100)} % satisfechos` : ''}`;
          return `<span role="cell" class="celda n${nivel(c.respuestas)}" title="${texto}" aria-label="${texto}">${c.respuestas || ''}</span>`;
        }).join('')}</div>`).join('')}
      </div>
      <div class="escala" aria-hidden="true"><span>Menos</span><i class="n1"></i><i class="n2"></i><i class="n3"></i><i class="n4"></i><span>Más</span></div>`;

    // Retroalimentación al vendedor (RF14)
    $('retro-vendedores').innerHTML = k.vendedores.length ? k.vendedores.map((v) => `
      <li>
        <div class="linea"><strong>${escapar(alcance === 'propio' ? 'Sus calificaciones' : v.nombre)}</strong><span class="ty-cifra">${porcentaje(v.leidas)} leídas</span></div>
        <div class="ty-medidor" role="img" aria-label="${porcentaje(v.leidas)} marcadas como Enterado"><span style="--valor:${(v.leidas ?? 0) / 100}"></span></div>
        <div class="ty-leyenda">${v.casosCerrados ? `Coaching confirmado en ${v.coaching} de ${plural(v.casosCerrados, 'caso cerrado', 'casos cerrados')}` : 'Sin casos cerrados en el periodo'}</div>
      </li>`).join('') : '<li class="ty-secundario">Aún no hay respuestas en este periodo.</li>';

    // Voz del cliente
    $('voz').innerHTML = k.comentarios.length ? k.comentarios.map((c) => `
      <li>
        <span class="ty-nota n${c.calificacion}">${c.calificacion}<small>/5</small></span>
        <div>
          <blockquote class="mb-1">“${escapar(c.comentario)}”</blockquote>
          <div class="ty-leyenda">${escapar(c.codigoCliente)} · ${c.segmento === 'mayorista' ? 'Mayorista' : 'Minorista'} · ${c.compro ? 'Compró' : 'No compró'}${alcance === 'propio' ? '' : ` · ${escapar(c.vendedor)}`} · ${UI.fecha(c.fecha)}</div>
        </div>
      </li>`).join('') : '<li class="ty-secundario">Ningún cliente escribió comentarios en este periodo.</li>';
  }

  // ---------- Filtros ----------
  document.querySelector('[aria-label="Medir los motivos por"]').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-vista]');
    if (!b || b.dataset.vista === vistaMotivos) return;
    vistaMotivos = b.dataset.vista;
    b.parentElement.querySelectorAll('button').forEach((x) => {
      x.classList.toggle('activo', x === b);
      x.setAttribute('aria-pressed', String(x === b));
    });
    if (ultimos) pintarMotivos(ultimos);
  });
  selPeriodo.addEventListener('change', () => {
    const rango = selPeriodo.value === 'rango';
    $('rango').hidden = !rango;
    if (rango) $('f-desde').focus(); else cargar();
  });
  $('filtros').addEventListener('submit', (e) => {
    e.preventDefault();
    if ($('f-desde').value > $('f-hasta').value) {
      Tylsefa.aviso('La fecha inicial debe ser anterior o igual a la final.', 'bi-exclamation-circle-fill', 'var(--ty-error)');
      return;
    }
    cargar();
  });
  for (const id of ['f-segmento', 'f-vendedor', 'f-pruebas']) $(id).addEventListener('change', cargar);

  cargar();
});
