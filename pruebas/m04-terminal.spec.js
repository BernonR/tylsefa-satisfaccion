// M04 · Terminal de autoservicio (CU-05): activación de la tableta, encuesta completa,
// apertura del caso según el segmento (RF09, RF10), número de un solo uso (RF06),
// acceso sin credenciales del cliente (RS07), regreso por inactividad y envío diferido (RNF05).
const crypto = require('node:crypto');
const { test, expect } = require('@playwright/test');
const { PaginaAcceso } = require('./paginas/acceso.pagina');
const { PaginaPanel } = require('./paginas/panel.pagina');
const { PaginaTerminal } = require('./paginas/terminal.pagina');
const usuarios = require('./datos/usuarios.json');
const bd = require('./apoyo/bd');

const clave = () => process.env.CLAVE_PRUEBAS;
const azar = () => crypto.randomBytes(3).toString('hex');
const digitosNuevos = () => `9${String(crypto.randomInt(0, 100000)).padStart(5, '0')}`;
const NO_ENCONTRADA = 'No encontramos una cotización pendiente con ese número';

let supervisor;   // contexto con la sesión del supervisor de prueba (registra cotizaciones)
let idSupervisor;
let idVendedor;   // vendedor temporal a cargo del supervisor de prueba
let minorista;
let mayorista;

async function contexto(browser, correo, contrasena = clave()) {
  const c = await browser.newContext();
  const r = await c.request.post('/api/sesion', { data: { correo, clave: contrasena } });
  expect(r.status()).toBe(200);
  return c;
}

// Una tableta activada: el supervisor entra, activa y su sesión se cierra.
async function tabletaActivada(browser) {
  const c = await contexto(browser, usuarios.supervisor.correo);
  expect((await c.request.post('/api/terminal/activar')).status()).toBe(200);
  return c;
}

async function cotizacion({ cliente = minorista, esPrueba = false } = {}) {
  const digitos = digitosNuevos();
  const r = await supervisor.request.post('/api/cotizaciones', { data: { numero: digitos, monto: '2500', idVendedor, idCliente: cliente.id, esPrueba } });
  expect(r.status()).toBe(201);
  return { id: (await r.json()).id, digitos, numero: `COT-${digitos}` };
}

async function casoDe(numero) {
  const { rows } = await bd.consulta(`
    SELECT cs.numero_caso, cs.id_responsable, cs.id_usuario_copia, cs.es_prueba, pr.nombre AS perfil_responsable,
           pl.minutos_primer_contacto, r.calificacion, r.concreto_compra, r.id_motivo, r.comentario
      FROM cotizacion c
      JOIN encuesta_respuesta r ON r.id_cotizacion = c.id_cotizacion
      LEFT JOIN caso_servicio cs ON cs.id_respuesta = r.id_respuesta
      LEFT JOIN usuario u ON u.id_usuario = cs.id_responsable
      LEFT JOIN perfil pr ON pr.id_perfil = u.id_perfil
      LEFT JOIN plazo_atencion pl ON pl.id_plazo = cs.id_plazo
     WHERE c.numero_correlativo = $1`, [numero]);
  return rows[0] || null;
}

test.beforeAll(async ({ browser }) => {
  const admin = await contexto(browser, usuarios.administrador.correo);
  const { rows: [sup] } = await bd.consulta('SELECT id_usuario FROM usuario WHERE correo = $1', [usuarios.supervisor.correo]);
  idSupervisor = sup.id_usuario;
  const alta = await admin.request.post('/api/usuarios', { data: { nombres: 'Vendedor', apellidos: 'Terminal', correo: `m04-${azar()}@pruebas.tylsefa.com`, perfil: 'vendedor', idSupervisor, clave: 'Temporal2026x' } });
  expect(alta.status()).toBe(201);
  idVendedor = (await alta.json()).id;
  for (const segmento of ['minorista', 'mayorista']) {
    const r = await admin.request.post('/api/clientes', { data: { nombre: `Prueba automática M04 ${segmento} ${azar()}`, segmento, correo: 'm04@prueba.tylsefa.com' } });
    expect(r.status()).toBe(201);
    if (segmento === 'minorista') minorista = (await r.json()).cliente; else mayorista = (await r.json()).cliente;
  }
  await admin.close();
  supervisor = await contexto(browser, usuarios.supervisor.correo);
});

test.afterAll(async () => {
  await supervisor?.close();
  await bd.limpiarCatalogos();
});

test('CP-M04-01 el supervisor activa la tableta, su sesión se cierra y queda solo la encuesta', async ({ page }) => {
  const desde = new Date(Date.now() - 5000);
  const acceso = new PaginaAcceso(page);
  await acceso.abrir();
  await acceso.ingresar(usuarios.supervisor.correo, clave());
  await new PaginaPanel(page).esperarCarga();
  await page.locator('#menu a[href="terminal-activar.html"]').click();
  await page.locator('#activar').click();
  await page.locator('.ty-alerta [data-respuesta]').click();
  await page.waitForURL('**/terminal.html');
  await new PaginaTerminal(page).enPaso('numero');
  expect((await page.request.get('/api/sesion')).status()).toBe(401);
  expect(await bd.ultimaAccion(usuarios.supervisor.correo, 'activacion_terminal', desde)).not.toBeNull();
});

test('CP-M04-02 cliente satisfecho que compró: se guarda la respuesta sin abrir caso', async ({ browser }) => {
  const cot = await cotizacion();
  const tableta = await tabletaActivada(browser);
  const terminal = new PaginaTerminal(await tableta.newPage());
  await terminal.abrir();
  await terminal.responder({ numero: cot.digitos, calificacion: 5, compro: true });
  await terminal.enviar();
  await terminal.enPaso('listo');
  await expect(terminal.caso).toBeHidden();
  const r = await casoDe(cot.numero);
  expect(r).toMatchObject({ calificacion: 5, concreto_compra: true, id_motivo: null, numero_caso: null });
  const { rows: [c] } = await bd.consulta('SELECT estado FROM cotizacion WHERE id_cotizacion = $1', [cot.id]);
  expect(c.estado).toBe('respondida');
  await tableta.close();
});

test('CP-M04-03 minorista insatisfecho: muestra el número de caso y lo asigna al supervisor del vendedor', async ({ browser }) => {
  const desde = new Date(Date.now() - 5000);
  const cot = await cotizacion();
  const tableta = await tabletaActivada(browser);
  const terminal = new PaginaTerminal(await tableta.newPage());
  await terminal.abrir();
  await terminal.ingresarNumero(cot.digitos);
  await expect(terminal.ficha).toContainText(minorista.nombre);
  await expect(terminal.ficha).toContainText('Le atendió Vendedor Terminal');
  await expect(terminal.ficha).not.toContainText('2,500');
  await terminal.page.locator('#escala [data-valor="2"]').click();
  await terminal.page.locator('[data-compro="no"]').click();
  await terminal.page.locator('#motivos .opcion').first().click();
  await terminal.page.locator('#comentario').fill('Esperaba un mejor precio.');
  await terminal.enviar();
  await terminal.enPaso('listo');
  await expect(terminal.numeroCaso).toHaveText(/^CASO-\d{6}$/);
  await expect(terminal.plazoCaso).toContainText('3 horas hábiles');

  const r = await casoDe(cot.numero);
  expect(r.numero_caso).toBe(await terminal.numeroCaso.textContent());
  expect(r).toMatchObject({ id_responsable: idSupervisor, id_usuario_copia: null, minutos_primer_contacto: 180, concreto_compra: false, comentario: 'Esperaba un mejor precio.' });
  expect(r.id_motivo).not.toBeNull();
  const { rows } = await bd.consulta("SELECT 1 FROM bitacora_auditoria WHERE accion = 'generacion_caso' AND detalle LIKE $1 AND fecha_hora >= $2", [`${r.numero_caso} %`, desde]);
  expect(rows).toHaveLength(1);
  await tableta.close();
});

test('CP-M04-04 mayorista insatisfecho: el caso va a la gerencia con copia al supervisor y respeta la marca de prueba', async ({ browser }) => {
  const cot = await cotizacion({ cliente: mayorista, esPrueba: true });
  const tableta = await tabletaActivada(browser);
  const r = await tableta.request.post('/api/terminal/respuestas', { data: { numero: cot.digitos, calificacion: 1, compro: true } });
  expect(r.status()).toBe(201);
  expect((await r.json()).caso.plazo).toBe('30 minutos hábiles');
  const caso = await casoDe(cot.numero);
  expect(caso).toMatchObject({ perfil_responsable: 'gerente', id_usuario_copia: idSupervisor, minutos_primer_contacto: 30, es_prueba: true });
  await tableta.close();
});

test('CP-M04-05 el número es de un solo uso y no se aceptan anuladas, vencidas ni inexistentes', async ({ browser }) => {
  const tableta = await tabletaActivada(browser);
  const validar = (numero) => tableta.request.post('/api/terminal/validar', { data: { numero } });

  const usada = await cotizacion();
  expect((await tableta.request.post('/api/terminal/respuestas', { data: { numero: usada.digitos, calificacion: 4, compro: true } })).status()).toBe(201);
  expect((await tableta.request.post('/api/terminal/respuestas', { data: { numero: usada.digitos, calificacion: 1, compro: true } })).status()).toBe(409);

  const anulada = await cotizacion();
  await supervisor.request.post(`/api/cotizaciones/${anulada.id}/anular`, { data: { motivo: 'Prueba de anulación' } });
  const vencida = await cotizacion();
  await bd.consulta("UPDATE cotizacion SET fecha_hora = now() - interval '8 days' WHERE id_cotizacion = $1", [vencida.id]);

  for (const numero of [usada.digitos, anulada.digitos, vencida.digitos, '000000']) {
    const r = await validar(numero);
    expect(r.status(), numero).toBe(404);
    expect((await r.json()).mensaje).toContain(NO_ENCONTRADA);
  }

  const terminal = new PaginaTerminal(await tableta.newPage());
  await terminal.abrir();
  await terminal.ingresarNumero(anulada.digitos);
  await expect(terminal.mensaje).toContainText(NO_ENCONTRADA);
  await terminal.enPaso('numero');
  await tableta.close();
});

test('CP-M04-06 sin activar no hay encuesta y los comprobantes de terminal y de personal no se intercambian', async ({ browser, request }) => {
  const cot = await cotizacion();
  expect((await request.get('/api/terminal/estado')).status()).toBe(401);
  expect((await request.post('/api/terminal/validar', { data: { numero: cot.digitos } })).status()).toBe(401);
  expect((await request.post('/api/terminal/respuestas', { data: { numero: cot.digitos, calificacion: 5, compro: true } })).status()).toBe(401);
  // La sesión del supervisor no sirve como terminal.
  expect((await supervisor.request.post('/api/terminal/validar', { data: { numero: cot.digitos } })).status()).toBe(401);
  // El comprobante de la terminal no abre el panel.
  const tableta = await tabletaActivada(browser);
  const { value } = (await tableta.cookies()).find((c) => c.name === 'tylsefa_terminal');
  const intruso = await browser.newContext({ extraHTTPHeaders: { Cookie: `tylsefa_sesion=${value}` } });
  expect((await intruso.request.get('/api/sesion')).status()).toBe(401);
  // El vendedor no puede activar una tableta.
  const vendedor = await contexto(browser, usuarios.vendedor.correo);
  expect((await vendedor.request.post('/api/terminal/activar')).status()).toBe(403);
  // En pantalla: aviso de terminal sin activar.
  const pagina = await intruso.newPage();
  await pagina.goto('/terminal.html');
  await new PaginaTerminal(pagina).enPaso('sin-activar');
  await Promise.all([tableta.close(), intruso.close(), vendedor.close()]);
});

test('CP-M04-07 tras 60 segundos sin tocar la pantalla vuelve al inicio y borra lo ingresado', async ({ browser }) => {
  const cot = await cotizacion();
  const tableta = await tabletaActivada(browser);
  const page = await tableta.newPage();
  await page.clock.install();
  const terminal = new PaginaTerminal(page);
  await terminal.abrir();
  await terminal.ingresarNumero(cot.digitos);
  await terminal.enPaso('calificacion');
  await page.clock.fastForward(59000);
  await terminal.enPaso('calificacion');
  await page.clock.fastForward(2000);
  await terminal.enPaso('numero');
  await expect(terminal.visor).toHaveValue('');
  await expect(terminal.ficha).toBeEmpty();
  await tableta.close();
});

test('CP-M04-08 sin internet la respuesta se guarda en la tableta y se envía al volver la conexión', async ({ browser }) => {
  const cot = await cotizacion();
  const tableta = await tabletaActivada(browser);
  const terminal = new PaginaTerminal(await tableta.newPage());
  await terminal.abrir();
  await terminal.responder({ numero: cot.digitos, calificacion: 4, compro: true, comentario: 'Respuesta sin conexión' });
  await tableta.setOffline(true);
  await terminal.enviar();
  await terminal.enPaso('listo');
  await expect(terminal.textoListo).toContainText('se enviará en cuanto vuelva la conexión');
  await expect(terminal.pendientes).toHaveText('1 respuesta por enviar');
  expect(await casoDe(cot.numero)).toBeNull();

  await tableta.setOffline(false);
  await expect(terminal.pendientes).toBeHidden({ timeout: 10000 });
  expect(await casoDe(cot.numero)).toMatchObject({ calificacion: 4, comentario: 'Respuesta sin conexión' });
  await tableta.close();
});

test('CP-M04-09 diez números incorrectos seguidos bloquean la tableta por un rato', async ({ browser }) => {
  const tableta = await tabletaActivada(browser);
  for (let i = 0; i < 10; i++) {
    expect((await tableta.request.post('/api/terminal/validar', { data: { numero: '000000' } })).status()).toBe(404);
  }
  const r = await tableta.request.post('/api/terminal/validar', { data: { numero: '000000' } });
  expect(r.status()).toBe(429);
  await tableta.close();
});
