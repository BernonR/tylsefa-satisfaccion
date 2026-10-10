'use strict';

// Comportamientos visuales compartidos por todas las pantallas.
// Solo agregan o quitan clases; el movimiento vive en sistema.css.

(function () {
  const sinMovimiento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Cifras que suben hasta su valor la primera vez que aparecen.
  function contar(elemento) {
    const destino = Number(elemento.dataset.contar);
    const decimales = Number(elemento.dataset.decimales || 0);
    const sufijo = elemento.dataset.sufijo || '';
    const formato = new Intl.NumberFormat('es-GT', { minimumFractionDigits: decimales, maximumFractionDigits: decimales });
    if (sinMovimiento) { elemento.textContent = formato.format(destino) + sufijo; return; }
    const duracion = 700;
    const inicio = performance.now();
    function paso(ahora) {
      const avance = Math.min((ahora - inicio) / duracion, 1);
      const suavizado = 1 - Math.pow(1 - avance, 3);
      elemento.textContent = formato.format(destino * suavizado) + sufijo;
      if (avance < 1) requestAnimationFrame(paso);
    }
    requestAnimationFrame(paso);
  }

  // Aparición al hacer scroll, medidores y cifras: se activan una sola vez.
  const observador = new IntersectionObserver((entradas) => {
    for (const entrada of entradas) {
      if (!entrada.isIntersecting) continue;
      const el = entrada.target;
      el.classList.add('visible');
      el.querySelectorAll('[data-contar]').forEach(contar);
      el.querySelectorAll('.ty-medidor > span').forEach((barra) => {
        barra.style.setProperty('--valor', barra.dataset.valor || 0);
      });
      observador.unobserve(el);
    }
  }, { threshold: 0.15 });

  document.querySelectorAll('.ty-revelar').forEach((el) => observador.observe(el));

  // Validación al salir del campo, con el mensaje debajo.
  document.querySelectorAll('[data-validar]').forEach((campo) => {
    campo.addEventListener('blur', () => {
      const valido = campo.checkValidity() && campo.value.trim() !== '';
      campo.classList.toggle('is-invalid', !valido);
      campo.setAttribute('aria-invalid', String(!valido));
    });
  });

  // Exponer utilidades para las pantallas.
  window.Tylsefa = {
    aviso(mensaje, icono = 'bi-check-circle-fill', color = 'var(--ty-exito)') {
      const contenedor = document.querySelector('.ty-avisos');
      if (!contenedor) return;
      const nodo = document.createElement('div');
      nodo.className = 'toast';
      nodo.setAttribute('role', 'status');
      nodo.setAttribute('aria-live', 'polite');
      nodo.innerHTML = `<div class="toast-body"><i class="bi ${icono}" style="color:${color}" aria-hidden="true"></i><span></span></div>`;
      nodo.querySelector('span').textContent = mensaje;
      contenedor.appendChild(nodo);
      const toast = new bootstrap.Toast(nodo, { delay: 3200 });
      nodo.addEventListener('hidden.bs.toast', () => nodo.remove());
      toast.show();
    },
    cargando(boton, activo) {
      if (activo) {
        boton.setAttribute('aria-busy', 'true');
        boton.dataset.texto = boton.innerHTML;
        boton.innerHTML = '<span class="spinner-border" aria-hidden="true"></span><span>Guardando</span>';
      } else {
        boton.removeAttribute('aria-busy');
        boton.innerHTML = boton.dataset.texto;
      }
    },
  };
})();
