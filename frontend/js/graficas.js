'use strict';

// Gráficas del tablero y de los reportes, dibujadas en SVG sin librerías externas.
// Los colores salen de variables CSS, así el mismo código sirve en el tema oscuro
// del sistema y en el reporte claro para imprimir.

(function () {
  const NS = 'http://www.w3.org/2000/svg';
  const fmt = (v, dec = 0) => new Intl.NumberFormat('es-GT', { minimumFractionDigits: dec, maximumFractionDigits: dec }).format(v);
  const css = (el, nombre) => getComputedStyle(el).getPropertyValue(nombre).trim();

  function nodo(tipo, atributos = {}, padre) {
    const n = document.createElementNS(NS, tipo);
    for (const [k, v] of Object.entries(atributos)) n.setAttribute(k, v);
    if (padre) padre.appendChild(n);
    return n;
  }

  // Burbuja de información al pasar el cursor o tocar.
  function burbuja(contenedor) {
    let b = contenedor.querySelector('.gr-burbuja');
    if (!b) {
      b = document.createElement('div');
      b.className = 'gr-burbuja';
      b.setAttribute('role', 'status');
      contenedor.appendChild(b);
    }
    return {
      mostrar(html, x, y) {
        b.innerHTML = html;
        b.style.opacity = '1';
        const ancho = contenedor.clientWidth;
        const bw = b.offsetWidth;
        b.style.transform = `translate(${Math.min(Math.max(x - bw / 2, 0), ancho - bw)}px, ${Math.max(y - b.offsetHeight - 10, 0)}px)`;
      },
      ocultar() { b.style.opacity = '0'; },
    };
  }

  function escalaLineal(d0, d1, r0, r1) {
    return (v) => r0 + ((v - d0) / (d1 - d0 || 1)) * (r1 - r0);
  }

  // Tabla oculta para lectores de pantalla.
  function tablaAccesible(contenedor, titulo, filas, columnas) {
    let t = contenedor.querySelector('table.visually-hidden');
    if (t) t.remove();
    t = document.createElement('table');
    t.className = 'visually-hidden';
    t.innerHTML = `<caption>${titulo}</caption><thead><tr>${columnas.map((c) => `<th scope="col">${c}</th>`).join('')}</tr></thead><tbody>${filas.map((f) => `<tr>${f.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody>`;
    contenedor.appendChild(t);
  }

  // ---------- Línea: tendencia en el tiempo ----------
  function linea(contenedor, { etiquetas, valores, prefijo = '', sufijo = '', decimales = 0, minimo, maximo, titulo = 'Tendencia', alto = 240 }) {
    function dibujar() {
      contenedor.querySelector('svg')?.remove();
      const ancho = contenedor.clientWidth;
      const m = { arriba: 16, derecha: 16, abajo: 32, izquierda: 44 };
      const svg = nodo('svg', { width: ancho, height: alto, viewBox: `0 0 ${ancho} ${alto}`, role: 'img', 'aria-label': titulo });
      contenedor.prepend(svg);
      const lo = minimo ?? Math.floor(Math.min(...valores) / 10) * 10;
      const hi = maximo ?? Math.ceil(Math.max(...valores) / 10) * 10;
      const x = escalaLineal(0, valores.length - 1, m.izquierda, ancho - m.derecha);
      const y = escalaLineal(lo, hi, alto - m.abajo, m.arriba);
      const tinta = css(contenedor, '--gr-tinta-3');
      const reja = css(contenedor, '--gr-reja');
      const serie = css(contenedor, '--gr-serie-1');

      for (let i = 0; i <= 4; i++) {
        const v = lo + ((hi - lo) / 4) * i;
        nodo('line', { x1: m.izquierda, x2: ancho - m.derecha, y1: y(v), y2: y(v), stroke: reja, 'stroke-width': 1 }, svg);
        const t = nodo('text', { x: m.izquierda - 8, y: y(v) + 4, 'text-anchor': 'end', fill: tinta, 'font-size': 12 }, svg);
        t.textContent = fmt(v) + sufijo.trim().slice(0, 1).replace(' ', '');
      }
      const paso = Math.ceil(etiquetas.length / Math.max(Math.floor((ancho - 60) / 70), 1));
      etiquetas.forEach((e, i) => {
        if (i % paso) return;
        const t = nodo('text', { x: x(i), y: alto - 10, 'text-anchor': 'middle', fill: tinta, 'font-size': 12 }, svg);
        t.textContent = e;
      });

      const puntos = valores.map((v, i) => `${x(i)},${y(v)}`).join(' ');
      const area = nodo('polygon', { points: `${x(0)},${y(lo)} ${puntos} ${x(valores.length - 1)},${y(lo)}`, fill: serie, 'fill-opacity': 0.12 }, svg);
      area.classList.add('gr-entrada');
      const trazo = nodo('polyline', { points: puntos, fill: 'none', stroke: serie, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, svg);
      trazo.classList.add('gr-trazo');
      const largo = trazo.getTotalLength ? trazo.getTotalLength() : 0;
      trazo.style.setProperty('--largo', largo);

      // Último valor etiquetado directamente
      const ult = valores.length - 1;
      nodo('circle', { cx: x(ult), cy: y(valores[ult]), r: 4, fill: serie, stroke: css(contenedor, '--gr-superficie'), 'stroke-width': 2 }, svg);
      const et = nodo('text', { x: x(ult) - 8, y: y(valores[ult]) - 12, 'text-anchor': 'end', fill: css(contenedor, '--gr-tinta'), 'font-size': 13, 'font-weight': 600 }, svg);
      et.textContent = fmt(valores[ult], decimales) + sufijo;

      // Guía vertical y burbuja
      const guia = nodo('line', { y1: m.arriba, y2: alto - m.abajo, stroke: tinta, 'stroke-width': 1, 'stroke-dasharray': '3 3', opacity: 0 }, svg);
      const marca = nodo('circle', { r: 5, fill: serie, stroke: css(contenedor, '--gr-superficie'), 'stroke-width': 2, opacity: 0 }, svg);
      const b = burbuja(contenedor);
      const zona = nodo('rect', { x: m.izquierda, y: m.arriba, width: ancho - m.izquierda - m.derecha, height: alto - m.arriba - m.abajo, fill: 'transparent' }, svg);
      function mover(ev) {
        const r = svg.getBoundingClientRect();
        const px = (ev.touches ? ev.touches[0].clientX : ev.clientX) - r.left;
        const i = Math.round(((px - m.izquierda) / (ancho - m.izquierda - m.derecha)) * (valores.length - 1));
        const k = Math.min(Math.max(i, 0), valores.length - 1);
        guia.setAttribute('x1', x(k)); guia.setAttribute('x2', x(k)); guia.setAttribute('opacity', 0.6);
        marca.setAttribute('cx', x(k)); marca.setAttribute('cy', y(valores[k])); marca.setAttribute('opacity', 1);
        b.mostrar(`<span class="gr-b-titulo">${etiquetas[k]}</span><strong>${fmt(valores[k], decimales)}${sufijo}</strong>`, x(k), y(valores[k]));
      }
      zona.addEventListener('pointermove', mover);
      zona.addEventListener('pointerleave', () => { guia.setAttribute('opacity', 0); marca.setAttribute('opacity', 0); b.ocultar(); });
    }
    dibujar();
    new ResizeObserver(() => dibujar()).observe(contenedor);
    tablaAccesible(contenedor, titulo, etiquetas.map((e, i) => [e, prefijo + fmt(valores[i], decimales) + sufijo]), ['Período', 'Valor']);
  }

  // ---------- Barras: verticales u horizontales ----------
  function barras(contenedor, { etiquetas, valores, colores, horizontal = false, prefijo = '', sufijo = '', decimales = 0, titulo = 'Distribución', alto, maximo, fila = 40 }) {
    function dibujar() {
      contenedor.querySelector('svg')?.remove();
      const ancho = contenedor.clientWidth;
      const n = valores.length;
      const altoTotal = alto ?? (horizontal ? n * fila + 8 : 220);
      const svg = nodo('svg', { width: ancho, height: altoTotal, viewBox: `0 0 ${ancho} ${altoTotal}`, role: 'img', 'aria-label': titulo });
      contenedor.prepend(svg);
      const tinta = css(contenedor, '--gr-tinta-3');
      const tintaFuerte = css(contenedor, '--gr-tinta');
      const tope = maximo ?? Math.max(...valores);
      const b = burbuja(contenedor);

      if (horizontal) {
        const medir = nodo('text', { 'font-size': 13, 'font-weight': 600, visibility: 'hidden' }, svg);
        let anchoEtiqueta = 0;
        let anchoValor = 0;
        etiquetas.forEach((e, i) => {
          medir.textContent = e; anchoEtiqueta = Math.max(anchoEtiqueta, medir.getComputedTextLength());
          medir.textContent = prefijo + fmt(valores[i], decimales) + sufijo; anchoValor = Math.max(anchoValor, medir.getComputedTextLength());
        });
        medir.remove();
        const izq = Math.min(anchoEtiqueta + 14, ancho * 0.5);
        const der = anchoValor + 16;
        const grosor = Math.min(22, fila - 10);
        const x = escalaLineal(0, tope, 0, ancho - izq - der);
        etiquetas.forEach((e, i) => {
          const yc = i * fila + fila / 2;
          const t = nodo('text', { x: izq - 12, y: yc + 4, 'text-anchor': 'end', fill: tintaFuerte, 'font-size': 13 }, svg);
          t.textContent = e;
          nodo('rect', { x: izq, y: yc - grosor / 2, width: ancho - izq - der, height: grosor, rx: 4, fill: css(contenedor, '--gr-pista') }, svg);
          const barra = nodo('rect', { x: izq, y: yc - grosor / 2, width: Math.max(x(valores[i]), 4), height: grosor, rx: 4, fill: colores ? colores[i] : css(contenedor, '--gr-serie-1') }, svg);
          barra.classList.add('gr-barra-h');
          const v = nodo('text', { x: ancho - 4, y: yc + 4, 'text-anchor': 'end', fill: tintaFuerte, 'font-size': 13, 'font-weight': 600 }, svg);
          v.textContent = prefijo + fmt(valores[i], decimales) + sufijo;
          const zona = nodo('rect', { x: 0, y: yc - fila / 2, width: ancho, height: fila, fill: 'transparent' }, svg);
          zona.addEventListener('pointerenter', () => b.mostrar(`<span class="gr-b-titulo">${e}</span><strong>${prefijo}${fmt(valores[i], decimales)}${sufijo}</strong>`, izq + x(valores[i]), yc - 8));
          zona.addEventListener('pointerleave', () => b.ocultar());
        });
      } else {
        const m = { arriba: 24, abajo: 30, lado: 8 };
        const banda = (ancho - m.lado * 2) / n;
        const anchoBarra = Math.min(banda * 0.56, 64);
        const y = escalaLineal(0, tope, altoTotal - m.abajo, m.arriba);
        nodo('line', { x1: m.lado, x2: ancho - m.lado, y1: y(0), y2: y(0), stroke: css(contenedor, '--gr-reja'), 'stroke-width': 1 }, svg);
        etiquetas.forEach((e, i) => {
          const xc = m.lado + banda * i + banda / 2;
          const h = Math.max(y(0) - y(valores[i]), 4);
          const barra = nodo('rect', { x: xc - anchoBarra / 2, y: y(0) - h, width: anchoBarra, height: h, rx: 4, fill: colores ? colores[i] : css(contenedor, '--gr-serie-1') }, svg);
          barra.classList.add('gr-barra-v');
          const v = nodo('text', { x: xc, y: y(0) - h - 8, 'text-anchor': 'middle', fill: tintaFuerte, 'font-size': 13, 'font-weight': 600 }, svg);
          v.textContent = prefijo + fmt(valores[i], decimales) + sufijo;
          const t = nodo('text', { x: xc, y: altoTotal - 10, 'text-anchor': 'middle', fill: tinta, 'font-size': 12 }, svg);
          t.textContent = e;
          const zona = nodo('rect', { x: xc - banda / 2, y: m.arriba, width: banda, height: altoTotal - m.arriba, fill: 'transparent' }, svg);
          zona.addEventListener('pointerenter', () => b.mostrar(`<span class="gr-b-titulo">${e}</span><strong>${prefijo}${fmt(valores[i], decimales)}${sufijo}</strong>`, xc, y(0) - h));
          zona.addEventListener('pointerleave', () => b.ocultar());
        });
      }
    }
    dibujar();
    new ResizeObserver(() => dibujar()).observe(contenedor);
    tablaAccesible(contenedor, titulo, etiquetas.map((e, i) => [e, prefijo + fmt(valores[i], decimales) + sufijo]), ['Categoría', 'Valor']);
  }

  window.Graficas = { linea, barras };
})();
