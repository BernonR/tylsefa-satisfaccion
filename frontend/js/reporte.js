'use strict';

// M06 · Reporte de satisfacción para imprimir o guardar como PDF (diseño aprobado).
// Recibe los mismos filtros del tablero en la dirección; solo la gerencia puede generarlo.
(async function () {
  const hoja = document.getElementById('hoja');
  const consulta = new URLSearchParams(location.search);
  const autoImprimir = consulta.get('imprimir') === '1';
  consulta.delete('imprimir');

  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const CORTOS = [[/precio/, 'Precio'], [/disponible/, 'No disponible'], [/pago/, 'Condiciones de pago'],
    [/entrega/, 'Tiempo de entrega'], [/compar/, 'Solo comparaba'], [/^otro/, 'Otro motivo']];
  const corto = (t) => (CORTOS.find(([p]) => p.test(t.toLowerCase())) || [null, t])[1];
  const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const numero = (v, d = 1) => new Intl.NumberFormat('es-GT', { minimumFractionDigits: d, maximumFractionDigits: d }).format(v);
  const pct = (v) => (v === null || v === undefined ? '—' : `${numero(v)} %`);
  const q = (v) => `Q ${numero(v || 0, 0)}`;
  const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
  const duracion = (min) => {
    if (min === null || min === undefined) return '—';
    if (min < 60) return `${min} min`;
    const h = Math.floor(min / 60); const m = min % 60;
    return m ? `${h} h ${m} min` : `${h} h`;
  };
  const fechaLarga = (iso) => {
    const [y, m, d] = iso.split('-').map(Number);
    return `${d} de ${MESES[m - 1]} de ${y}`;
  };
  const enGuatemala = (iso, opciones) => new Intl.DateTimeFormat('es-GT', { timeZone: 'America/Guatemala', ...opciones }).format(new Date(iso));
  const segmentoTexto = (s) => (s === 'mayorista' ? 'Mayorista' : 'Minorista');

  function periodoTexto({ desde, hasta }) {
    const [y, m] = desde.split('-').map(Number);
    const ultimo = new Date(Date.UTC(y, m, 0)).getUTCDate();
    if (desde.endsWith('-01') && hasta === `${desde.slice(0, 8)}${String(ultimo).padStart(2, '0')}`) return `${MESES[m - 1]} de ${y}`;
    if (desde === hasta) return fechaLarga(desde);
    return `${fechaLarga(desde)} al ${fechaLarga(hasta)}`;
  }

  let datos;
  try {
    datos = await Api.pedir(`/api/indicadores/reporte?${consulta}`);
  } catch (error) {
    document.getElementById('estado').textContent = error.estado === 403
      ? 'Su perfil no puede generar el reporte. Solo la gerencia exporta los indicadores.'
      : error.message;
    return;
  }

  const { indicadores: k, detalle, periodo, filtros, vendedores, generado } = datos;
  const vendedor = filtros.vendedor ? vendedores.find((v) => v.id === filtros.vendedor)?.nombre : null;
  const textoPeriodo = periodoTexto(periodo);
  const comparar = (puntos, menosEsMejor) => {
    if (puntos === null || puntos === undefined) return '<div class="cambio" style="color:var(--rp-tinta-2)">Sin datos del periodo anterior</div>';
    if (Math.abs(puntos) < 0.05) return '<div class="cambio" style="color:var(--rp-tinta-2)">Igual que el periodo anterior</div>';
    const sube = puntos > 0;
    return `<div class="cambio ${sube !== menosEsMejor ? 'sube' : 'baja'}">${sube ? '▲' : '▼'} ${numero(Math.abs(puntos))} puntos sobre el periodo anterior</div>`;
  };
  const filasVendedores = k.vendedores.map((v) => `
    <tr><td>${esc(v.nombre)}</td><td class="num">${v.respuestas}</td><td class="num">${pct(v.satisfechos)}</td><td class="num">${pct(v.insatisfechos)}</td>
      <td class="num">${pct(v.tasaCompra)}</td><td class="num">${v.casos}</td><td class="num">${v.casos ? pct(v.enPlazo) : '—'}</td></tr>`).join('');
  const maximoCalor = Math.max(1, ...k.horario.celdas.flat().map((c) => c.respuestas));
  const [mino, mayo] = k.segmentos;
  const filaSegmento = (nombre, f) => `<tr><td>${nombre}</td><td class="num">${f(mino)}</td><td class="num">${f(mayo)}</td></tr>`;
  const sinRespuestas = !k.respuestas;

  document.title = `Reporte de satisfacción ${textoPeriodo} | Tylsefa`;
  hoja.innerHTML = `
    <header class="membrete">
      <img src="img/logo-tylsefa.png" alt="Tylsefa" width="698" height="283">
      <div class="datos">Droguería y Comercial Tylsefa<br>Sucursal Tulam Tzu, zona 4 de Mixco<br>
        Generado el ${enGuatemala(generado.fecha, { day: 'numeric', month: 'long', year: 'numeric' })}, ${enGuatemala(generado.fecha, { hour: '2-digit', minute: '2-digit', hour12: false })}<br>Por: ${esc(generado.por)}</div>
    </header>

    <h1>Reporte de satisfacción del cliente${filtros.pruebas ? ' <span class="muestra prueba">INCLUYE REGISTROS DE PRUEBA</span>' : ''}</h1>
    <p class="subtitulo">Periodo: ${textoPeriodo} · ${vendedor ? esc(vendedor) : 'Todos los vendedores'} · ${filtros.segmento ? segmentoTexto(filtros.segmento) : 'Ambos segmentos'} · ${filtros.pruebas ? 'Incluye registros de prueba' : 'Excluye registros de prueba'}</p>

    <section class="indicadores" aria-label="Indicadores principales">
      <div class="ind"><div class="valor">${pct(k.satisfechos)}</div><div class="nombre">Clientes satisfechos (4 y 5)${k.promedio === null ? '' : ` · promedio ${numero(k.promedio)} de 5`}</div>${comparar(k.respuestas ? k.comparacion?.satisfechos : null, false)}</div>
      <div class="ind"><div class="valor">${pct(k.insatisfechos)}</div><div class="nombre">Clientes insatisfechos (1 y 2)${k.insatisfaccionPonderada === null ? '' : ` · ponderada por monto ${pct(k.insatisfaccionPonderada)}`}</div>${comparar(k.respuestas ? k.comparacion?.insatisfechos : null, true)}</div>
      <div class="ind"><div class="valor">${pct(k.casos.porcentaje)}</div><div class="nombre">Casos atendidos en plazo</div><div class="cambio ${k.casos.vencidos ? 'baja' : ''}" style="${k.casos.vencidos ? '' : 'color:var(--rp-tinta-2)'}">${k.casos.total ? plural(k.casos.vencidos, 'caso vencido', 'casos vencidos') : 'Sin casos en el periodo'}</div></div>
      <div class="ind"><div class="valor">${k.respuestas}</div><div class="nombre">Respuestas · tasa ${pct(k.tasaRespuesta)}</div><div class="cambio" style="color:var(--rp-tinta-2)">De ${plural(k.cotizaciones, 'cotización', 'cotizaciones')}</div></div>
    </section>

    <div class="dos" style="margin-top:5mm">
      <div class="caja">
        <h3>Satisfacción en el tiempo</h3>
        <p class="nota">Porcentaje de respuestas con calificación 4 o 5</p>
        ${k.tendencia.length ? '<div class="gr" id="rTendencia"></div>' : '<p class="nota">Sin respuestas en el periodo.</p>'}
      </div>
      <div class="caja">
        <h3>Ingreso expuesto</h3>
        <p class="nota">Monto cotizado a clientes insatisfechos o que no compraron</p>
        <div class="heroe">${q(k.expuesto.total)}</div>
        <p class="nota" style="margin-top:1mm">${k.expuesto.porcentaje === null ? 'Sin cotizaciones en el periodo' : `${pct(k.expuesto.porcentaje)} del total cotizado (${q(k.expuesto.totalCotizado)})`}</p>
        <div class="gr" id="rExpuesto"></div>
      </div>
    </div>

    <div class="dos" style="grid-template-columns: 1fr 1fr; margin-top:5mm">
      <div class="caja">
        <h3>Reparto de calificaciones</h3>
        <p class="nota">Cantidad de respuestas por nivel: 1 muy insatisfecho a 5 muy satisfecho</p>
        ${sinRespuestas ? '<p class="nota">Sin respuestas en el periodo.</p>' : '<div class="gr" id="rReparto"></div>'}
      </div>
      <div class="caja">
        <h3>Satisfacción y compra</h3>
        <p class="nota">Porcentaje que compró en cada nivel de calificación</p>
        ${sinRespuestas ? '<p class="nota">Sin respuestas en el periodo.</p>' : '<div class="gr" id="rCompra"></div><p class="lectura" id="rCompraLectura"></p>'}
      </div>
    </div>

    <h2 class="salto">Resultados por vendedor</h2>
    <p class="nota">Ordenado de mayor a menor satisfacción</p>
    <table>
      <thead><tr><th>Vendedor</th><th class="num">Respuestas</th><th class="num">Satisfechos</th><th class="num">Insatisfechos</th><th class="num">Tasa de compra</th><th class="num">Casos</th><th class="num">En plazo</th></tr></thead>
      <tbody>${filasVendedores || '<tr><td colspan="7">Sin respuestas en el periodo.</td></tr>'}
        <tr class="total"><td>${vendedor ? 'Total' : 'Sucursal'}</td><td class="num">${k.respuestas}</td><td class="num">${pct(k.satisfechos)}</td><td class="num">${pct(k.insatisfechos)}</td>
          <td class="num">${pct(k.compra.tasa)}</td><td class="num">${k.casos.total}</td><td class="num">${pct(k.casos.porcentaje)}</td></tr>
      </tbody>
    </table>

    <div class="dos" style="margin-top:6mm; grid-template-columns: 1fr 1fr">
      <div class="caja">
        <h3>Motivos de no compra</h3>
        <p class="nota">${plural(k.compra.sinCompra, 'interacción', 'interacciones')} sin compra · tasa de compra ${pct(k.compra.tasa)}</p>
        ${k.motivos.length ? `<table><thead><tr><th>Motivo</th><th class="num">Veces</th><th class="num">Monto no vendido</th></tr></thead><tbody>
          ${k.motivos.map((m) => `<tr><td>${esc(corto(m.motivo))}</td><td class="num">${m.cantidad}</td><td class="num">${q(m.monto)}</td></tr>`).join('')}</tbody></table>`
        : '<p class="nota">Todos los clientes del periodo compraron.</p>'}
      </div>
      <div class="caja">
        <h3>Tiempo de primer contacto</h3>
        <p class="nota">Promedio en horas hábiles contra el plazo comprometido</p>
        <table>
          <thead><tr><th>Segmento</th><th class="num">Promedio</th><th class="num">Plazo</th><th class="num">En plazo</th></tr></thead>
          <tbody>${k.contacto.map((c) => `<tr><td>${segmentoTexto(c.segmento)}</td><td class="num">${duracion(c.promedioMinutos)}</td><td class="num">${duracion(c.plazoMinutos)}</td><td class="num">${pct(c.enPlazo)}</td></tr>`).join('')}</tbody>
        </table>
      </div>
    </div>

    <h2>Minorista y mayorista</h2>
    <p class="nota">Resultados del periodo en cada segmento de cliente</p>
    <table>
      <thead><tr><th>Indicador</th><th class="num">Minorista</th><th class="num">Mayorista</th></tr></thead>
      <tbody>
        ${filaSegmento('Respuestas', (s) => s.respuestas)}
        ${filaSegmento('Satisfechos', (s) => pct(s.satisfechos))}
        ${filaSegmento('Insatisfechos', (s) => pct(s.insatisfechos))}
        ${filaSegmento('Tasa de compra', (s) => pct(s.tasaCompra))}
        ${filaSegmento('Monto promedio cotizado', (s) => (s.montoPromedio === null ? '—' : q(s.montoPromedio)))}
        ${filaSegmento('Ingreso expuesto', (s) => q(s.expuesto))}
      </tbody>
    </table>

    <h2 class="salto">Casos de servicio del periodo</h2>
    <p class="nota">Los clientes se identifican por código. Tiempos en horas hábiles desde que se creó el caso</p>
    ${detalle.casos.length ? `<table class="compacta">
      <thead><tr><th>Caso</th><th>Cliente</th><th>Segmento</th><th class="num">Calificación</th><th>Responsable</th><th class="num">Primer contacto</th><th class="num">Cierre</th><th>Cumplimiento</th></tr></thead>
      <tbody>${detalle.casos.map((c) => `<tr><td>${esc(c.numero)}</td><td>${esc(c.codigoCliente)}</td><td>${segmentoTexto(c.segmento)}</td><td class="num">${c.calificacion}</td>
        <td class="envolver">${esc(c.responsable)}</td><td class="num">${duracion(c.minutosContacto)}</td><td class="num">${duracion(c.minutosCierre)}</td>
        <td class="estado ${c.cumplimiento === 'en_plazo' ? 'cumple' : c.cumplimiento === 'vencido' ? 'no-cumple' : 'pendiente'}">${c.cumplimiento === 'en_plazo' ? 'En plazo' : c.cumplimiento === 'vencido' ? 'Vencido' : 'En curso'}</td></tr>`).join('')}</tbody>
    </table>` : '<p class="nota">No se abrieron casos en el periodo.</p>'}

    <h2>Retroalimentación al vendedor</h2>
    <p class="nota">Calificaciones marcadas como Enterado y coaching confirmado en casos cerrados</p>
    <table>
      <thead><tr><th>Vendedor</th><th class="num">Respuestas</th><th class="num">Leídas</th><th class="num">Casos cerrados</th><th class="num">Coaching confirmado</th></tr></thead>
      <tbody>${k.vendedores.map((v) => `<tr><td>${esc(v.nombre)}</td><td class="num">${v.respuestas}</td><td class="num">${pct(v.leidas)}</td><td class="num">${v.casosCerrados}</td><td class="num">${v.coaching}</td></tr>`).join('') || '<tr><td colspan="5">Sin respuestas en el periodo.</td></tr>'}</tbody>
    </table>

    <h2>Respuestas por día y hora</h2>
    <p class="nota">Cantidad de respuestas en la terminal; un tono más intenso indica más respuestas</p>
    <table class="calor">
      <thead><tr><th></th>${k.horario.horas.map((h) => `<th>${h}</th>`).join('')}</tr></thead>
      <tbody>${k.horario.dias.map((d, i) => `<tr><td>${d}</td>${k.horario.celdas[i].map((c) => `<td class="n${c.respuestas ? Math.ceil((c.respuestas / maximoCalor) * 4) : 0}">${c.respuestas || ''}</td>`).join('')}</tr>`).join('')}</tbody>
    </table>

    <h2>Voz del cliente</h2>
    <p class="nota">Últimos comentarios escritos en la terminal</p>
    ${k.comentarios.length ? `<ul class="voz">${k.comentarios.map((c) => `<li><q>${esc(c.comentario)}</q>
      <div class="meta">Calificación ${c.calificacion} · ${esc(c.codigoCliente)} · ${segmentoTexto(c.segmento)} · ${c.compro ? 'Compró' : 'No compró'} · ${esc(c.vendedor)} · ${enGuatemala(c.fecha, { day: 'numeric', month: 'short' })}</div></li>`).join('')}</ul>`
    : '<p class="nota">Ningún cliente escribió comentarios en el periodo.</p>'}

    <p class="firma">Los indicadores se calculan con las respuestas capturadas en la terminal de autoservicio y ${filtros.pruebas ? 'en este reporte incluyen los registros de prueba' : 'excluyen los registros de prueba'}. Horas hábiles de lunes a viernes de 8:00 a 17:00. Documento generado automáticamente por el sistema.</p>`;

  // Gráficas (versión clara de las del tablero)
  const $ = (id) => document.getElementById(id);
  const color = (id, nombre) => getComputedStyle($(id)).getPropertyValue(nombre).trim();
  if (k.tendencia.length) {
    Graficas.linea($('rTendencia'), { titulo: 'Satisfacción en el tiempo', etiquetas: k.tendencia.map((t) => t.etiqueta), valores: k.tendencia.map((t) => t.valor), sufijo: ' %', decimales: 1, minimo: 0, maximo: 100, alto: 170 });
  }
  Graficas.barras($('rExpuesto'), { titulo: 'Ingreso expuesto por segmento', horizontal: true, etiquetas: ['Mayorista', 'Minorista'], valores: [k.expuesto.mayorista, k.expuesto.minorista], prefijo: 'Q ', fila: 32 });
  if (!sinRespuestas) {
    const tonos = (id) => [color(id, '--gr-malo'), color(id, '--gr-malo'), color(id, '--gr-neutro'), color(id, '--gr-serie-1'), color(id, '--gr-serie-1')];
    Graficas.barras($('rReparto'), { titulo: 'Reparto de calificaciones', etiquetas: ['1', '2', '3', '4', '5'], valores: k.reparto, alto: 160, colores: tonos('rReparto') });
    Graficas.barras($('rCompra'), { titulo: 'Tasa de compra por calificación', etiquetas: ['1', '2', '3', '4', '5'], valores: k.compraPorNota.map((x) => x.tasa ?? 0), sufijo: ' %', maximo: 100, alto: 160, colores: tonos('rCompra') });
    const tasa = (lista) => {
      const r = lista.reduce((t, x) => t + x.respuestas, 0);
      return r ? lista.reduce((t, x) => t + (x.tasa ?? 0) * x.respuestas, 0) / r : null;
    };
    const altos = tasa(k.compraPorNota.slice(3)); const bajos = tasa(k.compraPorNota.slice(0, 2));
    $('rCompraLectura').textContent = altos !== null && bajos !== null
      ? `Compró el ${pct(altos)} de los satisfechos frente al ${pct(bajos)} de los insatisfechos.` : '';
  }
  document.body.classList.add('visible');

  const imprimir = () => window.print();
  $('acciones').hidden = false;
  $('imprimir').addEventListener('click', imprimir);
  document.body.dataset.listo = 'true';
  if (autoImprimir) {
    await document.fonts.ready;
    setTimeout(imprimir, 900); // deja terminar la animación de las gráficas
  }
})();
