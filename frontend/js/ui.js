'use strict';

// Utilidades de interfaz compartidas por los módulos: texto seguro, errores de formulario
// y la ventana de confirmación con el estilo de alerta del sistema.
(function () {
  const escapar = (valor) => String(valor ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // Marca en rojo los campos que el servidor rechazó, con su mensaje debajo.
  function mostrarErrores(formulario, errores = {}) {
    limpiarErrores(formulario);
    let primero = null;
    for (const [campo, mensaje] of Object.entries(errores)) {
      const control = formulario.querySelector(`[name="${campo}"]`);
      if (!control) continue;
      control.classList.add('is-invalid');
      control.setAttribute('aria-invalid', 'true');
      const ayuda = document.createElement('div');
      ayuda.className = 'invalid-feedback';
      ayuda.dataset.servidor = '';
      ayuda.textContent = mensaje;
      ayuda.style.display = 'block';
      // En campos con prefijo (COT-, Q) o con botón de ver contraseña, el mensaje va debajo del grupo.
      const grupo = control.closest('.ty-prefijo, .ty-campo-clave') || control;
      grupo.insertAdjacentElement('afterend', ayuda);
      primero ??= control;
    }
    primero?.focus();
  }

  function limpiarErrores(formulario) {
    formulario.querySelectorAll('.is-invalid').forEach((c) => { c.classList.remove('is-invalid'); c.removeAttribute('aria-invalid'); });
    formulario.querySelectorAll('[data-servidor]').forEach((n) => n.remove());
  }

  const datos = (formulario) => Object.fromEntries(new FormData(formulario).entries());

  // Confirmación con botones apilados (estilo iOS). Devuelve true si la persona acepta.
  function confirmar({ titulo, texto, boton = 'Aceptar', peligro = false }) {
    return new Promise((resolver) => {
      const nodo = document.createElement('div');
      nodo.className = 'modal fade ty-alerta';
      nodo.tabIndex = -1;
      nodo.innerHTML = `
        <div class="modal-dialog modal-dialog-centered"><div class="modal-content">
          <h2></h2><p></p>
          <div class="acciones">
            <button type="button" class="btn ${peligro ? 'btn-ty-peligro' : 'btn-ty-primario'}" data-respuesta="si"></button>
            <button type="button" class="btn btn-ty-secundario" data-bs-dismiss="modal">Cancelar</button>
          </div>
        </div></div>`;
      nodo.querySelector('h2').textContent = titulo;
      nodo.querySelector('p').textContent = texto;
      nodo.querySelector('[data-respuesta]').textContent = boton;
      document.body.appendChild(nodo);
      const modal = new bootstrap.Modal(nodo);
      let respuesta = false;
      let abierta = false;
      // Si se toca antes de que termine de abrir, se cierra en cuanto termina (Bootstrap ignora hide() a medio abrir).
      nodo.addEventListener('shown.bs.modal', () => { abierta = true; if (respuesta) modal.hide(); });
      nodo.querySelector('[data-respuesta]').addEventListener('click', () => { respuesta = true; if (abierta) modal.hide(); });
      nodo.addEventListener('hidden.bs.modal', () => { nodo.remove(); resolver(respuesta); });
      modal.show();
    });
  }

  // Botón ocupado mientras se guarda.
  function ocupado(boton, activo, texto = 'Guardando') {
    if (activo) {
      boton.dataset.texto = boton.innerHTML;
      boton.disabled = true;
      boton.setAttribute('aria-busy', 'true');
      boton.innerHTML = `<span class="spinner-border spinner-border-sm" aria-hidden="true"></span><span>${escapar(texto)}</span>`;
    } else {
      boton.disabled = false;
      boton.removeAttribute('aria-busy');
      if (boton.dataset.texto) boton.innerHTML = boton.dataset.texto;
    }
  }

  // Espera a que la persona deje de escribir antes de buscar.
  function demorar(fn, ms = 250) {
    let reloj;
    return (...args) => { clearTimeout(reloj); reloj = setTimeout(() => fn(...args), ms); };
  }

  // Formatos de Guatemala: quetzales y fecha/hora local.
  const formatoMoneda = new Intl.NumberFormat('es-GT', { style: 'currency', currency: 'GTQ' });
  const formatoFecha = new Intl.DateTimeFormat('es-GT', { timeZone: 'America/Guatemala', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });
  const formatoDia = new Intl.DateTimeFormat('es-GT', { timeZone: 'America/Guatemala', day: '2-digit', month: '2-digit', year: 'numeric' });
  const formatoHora = new Intl.DateTimeFormat('es-GT', { timeZone: 'America/Guatemala', hour: 'numeric', minute: '2-digit', hour12: true });
  const moneda = (n) => formatoMoneda.format(Number(n) || 0);
  const fecha = (iso) => formatoDia.format(new Date(iso));
  const hora = (iso) => formatoHora.format(new Date(iso));
  // "Cristian Josué López León" → "Cristian López"
  const nombreCorto = (completo = '') => { const p = completo.split(' '); return p.length >= 4 ? `${p[0]} ${p[2]}` : completo; };
  const fechaHora = (iso) => formatoFecha.format(new Date(iso));

  window.UI = { escapar, mostrarErrores, limpiarErrores, datos, confirmar, ocupado, demorar, moneda, fechaHora, fecha, hora, nombreCorto };
})();
