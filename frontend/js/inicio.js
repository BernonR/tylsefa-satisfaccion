'use strict';

// Pantalla de inicio: saludo y módulos a los que tiene acceso el perfil.
Panel.listo.then((usuario) => {
  const zona = { timeZone: 'America/Guatemala' };
  const hora = Number(new Intl.DateTimeFormat('es-GT', { ...zona, hour: 'numeric', hourCycle: 'h23' }).format(new Date()));
  const saludo = hora < 12 ? 'Buenos días' : hora < 19 ? 'Buenas tardes' : 'Buenas noches';
  document.getElementById('saludo').textContent = `${saludo}, ${usuario.nombres.split(' ')[0]}`;
  const fecha = new Intl.DateTimeFormat('es-GT', { ...zona, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());
  document.getElementById('fecha').textContent = fecha.charAt(0).toUpperCase() + fecha.slice(1);

  const contenedor = document.getElementById('modulos');
  const modulos = Panel.MODULOS.filter((m) => m.id !== 'inicio' && Panel.permitido(m, usuario));
  for (const m of modulos) {
    const col = document.createElement('div');
    col.className = 'col-12 col-md-6 col-xl-4 ty-revelar';
    col.dataset.modulo = m.id;
    col.innerHTML = `
      <div class="ty-tarjeta ty-modulo">
        <span class="icono"><i class="bi ${m.icono}" aria-hidden="true"></i></span>
        <div>
          <h3 class="ty-subtitulo mb-1"></h3>
          <p class="ty-secundario mb-2"></p>
          <span class="ty-estado ty-estado-neutro">Próximamente</span>
        </div>
      </div>`;
    col.querySelector('h3').textContent = m.texto;
    col.querySelector('p').textContent = m.descripcion;
    contenedor.appendChild(col);
    requestAnimationFrame(() => col.classList.add('visible'));
  }
});
