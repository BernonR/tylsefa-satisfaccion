'use strict';

// Inicio de sesión del personal (CU-02).
(function () {
  const formulario = document.getElementById('formulario');
  const correo = document.getElementById('correo');
  const clave = document.getElementById('clave');
  const verClave = document.getElementById('ver-clave');
  const entrar = document.getElementById('entrar');
  const aviso = document.getElementById('aviso');

  const MOTIVOS = {
    inactividad: ['info', 'bi-clock-history', 'Su sesión se cerró después de 15 minutos sin actividad. Ingrese de nuevo para continuar.'],
    sesion: ['info', 'bi-shield-lock', 'Inicie sesión para continuar.'],
    salida: ['info', 'bi-check-circle', 'Cerró sesión correctamente.'],
  };

  function mostrar(tipo, icono, texto) {
    aviso.className = `ty-mensaje ${tipo} mb-3`;
    aviso.setAttribute('role', tipo === 'error' ? 'alert' : 'status');
    aviso.innerHTML = `<i class="bi ${icono}" aria-hidden="true"></i><span></span>`;
    aviso.querySelector('span').textContent = texto;
  }
  function ocultar() { aviso.className = 'd-none'; aviso.textContent = ''; }

  function validar(campo) {
    const valido = campo.checkValidity() && campo.value.trim() !== '';
    campo.classList.toggle('is-invalid', !valido);
    campo.setAttribute('aria-invalid', String(!valido));
    return valido;
  }

  function ocupado(activo) {
    entrar.disabled = activo;
    if (activo) {
      entrar.setAttribute('aria-busy', 'true');
      entrar.innerHTML = '<span class="spinner-border" aria-hidden="true"></span><span>Verificando</span>';
    } else {
      entrar.removeAttribute('aria-busy');
      entrar.innerHTML = 'Iniciar sesión<i class="bi bi-arrow-right" aria-hidden="true"></i>';
    }
  }

  // Mensaje según cómo se llegó a esta página (cierre, inactividad, sesión vencida).
  const motivo = new URLSearchParams(location.search).get('motivo');
  if (MOTIVOS[motivo]) mostrar(...MOTIVOS[motivo]);

  // Si ya hay una sesión abierta, se entra directo al panel.
  if (!motivo) {
    Api.pedir('/api/sesion', { redirigir: false })
      .then(() => location.replace('inicio.html'))
      .catch(() => {});
  }

  correo.addEventListener('blur', () => { if (correo.value) validar(correo); });
  clave.addEventListener('blur', () => { if (clave.value) validar(clave); });

  verClave.addEventListener('click', () => {
    const visible = clave.type === 'text';
    clave.type = visible ? 'password' : 'text';
    verClave.setAttribute('aria-pressed', String(!visible));
    verClave.setAttribute('aria-label', visible ? 'Mostrar contraseña' : 'Ocultar contraseña');
    verClave.firstElementChild.className = visible ? 'bi bi-eye' : 'bi bi-eye-slash';
  });

  formulario.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const correcto = [validar(correo), validar(clave)].every(Boolean);
    if (!correcto) {
      (correo.classList.contains('is-invalid') ? correo : clave).focus();
      return;
    }
    ocultar();
    ocupado(true);
    try {
      await Api.pedir('/api/sesion', { metodo: 'POST', datos: { correo: correo.value.trim(), clave: clave.value }, redirigir: false });
      location.replace('inicio.html');
    } catch (error) {
      ocupado(false);
      clave.value = '';
      mostrar('error', 'bi-exclamation-circle', error.message);
      clave.focus();
    }
  });
})();
