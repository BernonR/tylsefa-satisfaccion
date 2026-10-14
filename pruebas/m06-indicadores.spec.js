// M06 · Tablero de indicadores (RF13): indicadores del periodo, alcance por perfil (RS04),
// filtros y exclusión de los registros de prueba (RF15) salvo el interruptor de la gerencia.
const crypto = require('node:crypto');
const { test, expect } = require('@playwright/test');
const { PaginaAcceso } = require('./paginas/acceso.pagina');
const { PaginaPanel } = require('./paginas/panel.pagina');
const { PaginaIndicadores } = require('./paginas/indicadores.pagina');
const usuarios = require('./datos/usuarios.json');
const bd = require('./apoyo/bd');

const clave = () => process.env.CLAVE_PRUEBAS;
const azar = () => crypto.randomBytes(3).toString('hex');
const digitosNuevos = () => `9${String(crypto.randomInt(0, 100000)).padStart(5, '0')}`;
const CLAVE_TEMPORAL = 'Temporal2026x';

let supervisor;
let tableta;
let equipo;   // vendedora a cargo del supervisor de prueba
let ajeno;    // vendedor de otro supervisor: el supervisor de prueba no lo ve
const clientes = {};

async function contexto(browser, correo, contrasena = clave()) {
  const c = await browser.newContext();
  const r = await c.request.post('/api/sesion', { data: { correo, clave: contrasena } });
  expect(r.status()).toBe(200);
  return c;
}

async function entrar(page, correo, contrasena = clave()) {
  const acceso = new PaginaAcceso(page);
  await acceso.abrir();
  await acceso.ingresar(correo, contrasena);
  await new PaginaPanel(page).esperarCarga();
}

// Cotización registrada y calificada hoy en la terminal.
async function calificar({ vendedor, cliente = clientes.minorista, calificacion, compro, monto, esPrueba = false }) {
  const numero = digitosNuevos();
  expect((await supervisor.request.post('/api/cotizaciones', {
    data: { numero, monto: String(monto), idVendedor: vendedor.id, idCliente: cliente.id, esPrueba },
  })).status()).toBe(201);
  const r = await tableta.request.post('/api/terminal/respuestas', {
    data: { numero, calificacion, compro, idMotivo: compro ? undefined : 1, comentario: 'Prueba automática de indicadores' },
  });
  expect(r.status()).toBe(201);
}

test.beforeAll(async ({ browser }) => {
  const admin = await contexto(browser, usuarios.administrador.correo);
  const { rows: [sup] } = await bd.consulta('SELECT id_usuario FROM usuario WHERE correo = $1', [usuarios.supervisor.correo]);
  const otro = await admin.request.post('/api/usuarios', {
    data: { nombres: 'Supervisor', apellidos: 'Otro equipo', correo: `m06-sup-${azar()}@pruebas.tylsefa.com`, perfil: 'supervisor', clave: CLAVE_TEMPORAL },
  });
  expect(otro.status()).toBe(201);
  const idOtro = (await otro.json()).id;
  for (const [clave, idSupervisor] of [['equipo', sup.id_usuario], ['ajeno', idOtro]]) {
    const correo = `m06-${clave}-${azar()}@pruebas.tylsefa.com`;
    const alta = await admin.request.post('/api/usuarios', {
      data: { nombres: clave === 'equipo' ? 'Vendedora' : 'Vendedor', apellidos: clave === 'equipo' ? 'Indicadores Equipo' : 'Indicadores Ajeno', correo, perfil: 'vendedor', idSupervisor, clave: CLAVE_TEMPORAL },
    });
    expect(alta.status()).toBe(201);
    const vendedor = { id: (await alta.json()).id, correo };
    if (clave === 'equipo') equipo = vendedor; else ajeno = vendedor;
  }
  for (const segmento of ['minorista', 'mayorista']) {
    const r = await admin.request.post('/api/clientes', { data: { nombre: `Prueba automática M06 ${segmento} ${azar()}`, segmento, correo: 'm06@prueba.tylsefa.com', contacto: 'Contacto Prueba' } });
    expect(r.status()).toBe(201);
    clientes[segmento] = (await r.json()).cliente;
  }
  await admin.close();
  supervisor = await contexto(browser, usuarios.supervisor.correo);
  tableta = await contexto(browser, usuarios.supervisor.correo);
  expect((await tableta.request.post('/api/terminal/activar')).status()).toBe(200);

  // Vendedora del equipo: 2 satisfechos que compraron, 2 insatisfechos que no compraron,
  // y una respuesta marcada como prueba que no debe contar.
  await calificar({ vendedor: equipo, calificacion: 5, compro: true, monto: 10000 });
  await calificar({ vendedor: equipo, calificacion: 4, compro: true, monto: 10000 });
  await calificar({ vendedor: equipo, calificacion: 2, compro: false, monto: 30000, cliente: clientes.mayorista });
  await calificar({ vendedor: equipo, calificacion: 1, compro: false, monto: 5000 });
  await calificar({ vendedor: equipo, calificacion: 5, compro: true, monto: 8000, esPrueba: true });
  await calificar({ vendedor: ajeno, calificacion: 3, compro: true, monto: 7000 });
});

test.afterAll(async () => {
  await Promise.all([supervisor?.close(), tableta?.close()]);
  await bd.limpiarCatalogos();
});

test('CP-M06-01 la gerencia ve los indicadores del vendedor elegido sin los registros de prueba', async ({ page }) => {
  await entrar(page, usuarios.gerente.correo);
  const tablero = new PaginaIndicadores(page);
  await tablero.abrir();
  await tablero.filtrar(() => tablero.periodo.selectOption({ label: 'Hoy' }));
  await tablero.filtrar(() => tablero.vendedor.selectOption(String(equipo.id)));

  await expect(tablero.respuestas).toHaveText('4');
  await expect(tablero.satisfechos).toHaveText('50.0 %');
  await expect(tablero.insatisfechos).toHaveText('50.0 %');
  // Ingreso expuesto: lo cotizado a quienes quedaron insatisfechos o no compraron (30,000 + 5,000).
  await expect(tablero.expuesto).toHaveText('Q 35,000');
  await expect(page.locator('#k-insatisfechos-detalle')).toHaveText('Ponderada por monto: 63.6 %');
  await expect(tablero.motivos).toContainText('Precio');
  await expect(tablero.vendedores).toContainText('Indicadores');
  await expect(tablero.avisoPruebas).toBeHidden();
});

test('CP-M06-02 el interruptor de pruebas solo lo tiene la gerencia y queda señalado', async ({ page }) => {
  await entrar(page, usuarios.gerente.correo);
  const tablero = new PaginaIndicadores(page);
  await tablero.abrir();
  await tablero.filtrar(() => tablero.periodo.selectOption({ label: 'Hoy' }));
  await tablero.filtrar(() => tablero.vendedor.selectOption(String(equipo.id)));
  await tablero.filtrar(() => tablero.pruebas.check());
  await expect(tablero.respuestas).toHaveText('5');
  await expect(tablero.avisoPruebas).toBeVisible();
  await tablero.filtrar(() => tablero.segmento.selectOption('mayorista'));
  await expect(tablero.respuestas).toHaveText('1');
  await expect(tablero.insatisfechos).toHaveText('100.0 %');

  // El supervisor no puede incluir pruebas aunque lo pida por la dirección.
  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guatemala' }).format(new Date());
  const r = await supervisor.request.get(`/api/indicadores?desde=${hoy}&hasta=${hoy}&vendedor=${equipo.id}&pruebas=1`);
  expect(r.status()).toBe(200);
  const datos = await r.json();
  expect(datos.filtros.pruebas).toBe(false);
  expect(datos.puedeIncluirPruebas).toBe(false);
  expect(datos.indicadores.respuestas).toBe(4);
});

test('CP-M06-03 el supervisor ve solo a su equipo y no puede consultar a otro vendedor', async ({ page }) => {
  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guatemala' }).format(new Date());
  const r = await supervisor.request.get(`/api/indicadores?desde=${hoy}&hasta=${hoy}`);
  const datos = await r.json();
  expect(datos.alcance).toBe('equipo');
  expect(datos.vendedores.map((v) => v.id)).toContain(equipo.id);
  expect(datos.vendedores.map((v) => v.id)).not.toContain(ajeno.id);
  expect(datos.indicadores.vendedores.map((v) => v.id)).not.toContain(ajeno.id);
  expect((await supervisor.request.get(`/api/indicadores?vendedor=${ajeno.id}`)).status()).toBe(403);

  await entrar(page, usuarios.supervisor.correo);
  const tablero = new PaginaIndicadores(page);
  await tablero.abrir();
  await expect(page.locator('#subtitulo')).toContainText('a su cargo');
  await expect(tablero.cajaVendedor).toBeVisible();
  await expect(tablero.cajaPruebas).toBeHidden();
});

test('CP-M06-04 el vendedor ve únicamente sus propios resultados', async ({ page, browser }) => {
  const propio = await contexto(browser, equipo.correo, CLAVE_TEMPORAL);
  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guatemala' }).format(new Date());
  const datos = await (await propio.request.get(`/api/indicadores?desde=${hoy}&hasta=${hoy}&vendedor=${ajeno.id}`)).json();
  expect(datos.alcance).toBe('propio');
  expect(datos.vendedores).toEqual([]);
  expect(datos.indicadores.respuestas).toBe(4); // pidió a otro vendedor y aun así ve solo lo suyo
  await propio.close();

  await entrar(page, equipo.correo, CLAVE_TEMPORAL);
  const tablero = new PaginaIndicadores(page);
  await tablero.abrir();
  await tablero.filtrar(() => tablero.periodo.selectOption({ label: 'Hoy' }));
  await expect(tablero.respuestas).toHaveText('4');
  await expect(tablero.cajaVendedor).toBeHidden();
  await expect(tablero.vendedores).toBeHidden();
});

test('CP-M06-05 el administrador no tiene tablero y un periodo inválido se rechaza', async ({ browser }) => {
  const admin = await contexto(browser, usuarios.administrador.correo);
  expect((await admin.request.get('/api/indicadores')).status()).toBe(403);
  await admin.close();
  expect((await supervisor.request.get('/api/indicadores?desde=2026-10-20&hasta=2026-10-01')).status()).toBe(400);
  expect((await supervisor.request.get('/api/indicadores?desde=2026-02-30&hasta=2026-03-01')).status()).toBe(400);
  expect((await supervisor.request.get('/api/indicadores?segmento=otro')).status()).toBe(400);
});

test('CP-M06-06 análisis adicionales: compra por calificación, monto por motivo, segmentos, horario, retroalimentación y voz del cliente', async ({ page }) => {
  await entrar(page, usuarios.gerente.correo);
  const tablero = new PaginaIndicadores(page);
  await tablero.abrir();
  await tablero.filtrar(() => tablero.periodo.selectOption({ label: 'Hoy' }));
  await tablero.filtrar(() => tablero.vendedor.selectOption(String(equipo.id)));

  await expect(page.locator('#t-compra-nota-lectura')).toHaveText('Compró el 100.0 % de los satisfechos (4 y 5) frente al 0.0 % de los insatisfechos (1 y 2).');
  // Los dos que no compraron dieron el mismo motivo: 30,000 + 5,000 quetzales sin vender.
  await page.locator('[data-vista="monto"]').click();
  await expect(tablero.motivos).toContainText('Q 35,000');
  const mayorista = page.locator('#tabla-segmentos tbody tr', { hasText: 'Respuestas' }).locator('td').nth(1);
  await expect(mayorista).toHaveText('1');
  await expect(page.locator('#g-horario .celda.n4').first()).toBeVisible();
  await expect(page.locator('#retro-vendedores')).toContainText('0.0 % leídas');
  await expect(page.locator('#voz li').first()).toContainText('Prueba automática de indicadores');
  await expect(page.locator('#voz li').first()).toContainText(/CLI-\d{4}/);
});
