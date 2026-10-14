// Prueba de punta a punta: el recorrido completo de una atención, tal como ocurre en la sucursal.
// El supervisor registra la cotización, el cliente califica en la tableta, el supervisor atiende
// y cierra el caso, la vendedora lee su retroalimentación y la gerencia lo ve en el tablero.
// Para presentarla con calma: npm run presentacion -- -g "CP-E2E"
const crypto = require('node:crypto');
const { test, expect } = require('@playwright/test');
const { PaginaAcceso } = require('./paginas/acceso.pagina');
const { PaginaPanel } = require('./paginas/panel.pagina');
const { PaginaCotizaciones } = require('./paginas/cotizaciones.pagina');
const { PaginaTerminal } = require('./paginas/terminal.pagina');
const { PaginaCasos, PaginaRetroalimentacion } = require('./paginas/casos.pagina');
const { PaginaIndicadores } = require('./paginas/indicadores.pagina');
const usuarios = require('./datos/usuarios.json');
const bd = require('./apoyo/bd');

const clave = () => process.env.CLAVE_PRUEBAS;
const azar = () => crypto.randomBytes(3).toString('hex');
const CLAVE_TEMPORAL = 'Temporal2026x';
const presentacion = Boolean(process.env.PRESENTACION);
const pausa = (page, ms = 1500) => (presentacion ? page.waitForTimeout(ms) : Promise.resolve());

let vendedora;
let cliente;

async function entrar(page, correo, contrasena = clave()) {
  const acceso = new PaginaAcceso(page);
  await acceso.abrir();
  await acceso.ingresar(correo, contrasena);
  await new PaginaPanel(page).esperarCarga();
}

test.beforeAll(async ({ browser }) => {
  const admin = await browser.newContext();
  expect((await admin.request.post('/api/sesion', { data: { correo: usuarios.administrador.correo, clave: clave() } })).status()).toBe(200);
  const { rows: [sup] } = await bd.consulta('SELECT id_usuario FROM usuario WHERE correo = $1', [usuarios.supervisor.correo]);
  const correo = `m09-${azar()}@pruebas.tylsefa.com`;
  const alta = await admin.request.post('/api/usuarios', {
    data: { nombres: 'Vendedora', apellidos: 'Flujo Completo', correo, perfil: 'vendedor', idSupervisor: sup.id_usuario, clave: CLAVE_TEMPORAL },
  });
  expect(alta.status()).toBe(201);
  vendedora = { id: (await alta.json()).id, correo, nombre: 'Vendedora Flujo Completo' };
  const r = await admin.request.post('/api/clientes', { data: { nombre: `Prueba automática Flujo ${azar()}`, segmento: 'minorista', correo: 'flujo@prueba.tylsefa.com', contacto: 'Contacto Prueba' } });
  expect(r.status()).toBe(201);
  cliente = (await r.json()).cliente;
  await admin.close();
});

test.afterAll(async () => {
  await bd.limpiarCatalogos();
});

test('CP-E2E-01 flujo completo: cotización, encuesta, caso, cierre, retroalimentación y tablero', async ({ browser }) => {
  test.setTimeout(presentacion ? 600000 : 120000);
  const numero = `9${String(crypto.randomInt(0, 100000)).padStart(5, '0')}`;

  // 1. El supervisor registra la cotización antes de entregarla al cliente.
  const sesionSupervisor = await browser.newContext();
  const supervisor = await sesionSupervisor.newPage();
  await test.step('El supervisor registra la cotización', async () => {
    await entrar(supervisor, usuarios.supervisor.correo);
    const cotizaciones = new PaginaCotizaciones(supervisor);
    await cotizaciones.abrir();
    await cotizaciones.registrar({ numero, monto: '8500', vendedor: vendedora.nombre, cliente: cliente.nombre });
    await expect(cotizaciones.fila(`COT-${numero}`)).toContainText('Pendiente');
    await pausa(supervisor);
  });

  // 2. El cliente califica en la tableta: insatisfecho y no compró, con comentario.
  const sesionTableta = await browser.newContext();
  let numeroCaso;
  await test.step('El cliente califica en la terminal y se abre un caso', async () => {
    expect((await sesionTableta.request.post('/api/sesion', { data: { correo: usuarios.supervisor.correo, clave: clave() } })).status()).toBe(200);
    expect((await sesionTableta.request.post('/api/terminal/activar')).status()).toBe(200);
    const terminal = new PaginaTerminal(await sesionTableta.newPage());
    await terminal.abrir();
    await terminal.responder({ numero, calificacion: 2, compro: false, motivo: 0, comentario: 'Esperé mucho para que me atendieran.' });
    await pausa(terminal.page);
    await terminal.enviar();
    await terminal.enPaso('listo');
    await expect(terminal.caso).toBeVisible();
    numeroCaso = (await terminal.numeroCaso.textContent()).trim();
    expect(numeroCaso).toMatch(/^CASO-\d{6}$/);
    await pausa(terminal.page, 2500);
  });

  // 3. El supervisor atiende el caso: primer contacto, una actuación y el cierre.
  await test.step('El supervisor contacta al cliente y cierra el caso', async () => {
    const casos = new PaginaCasos(supervisor);
    await casos.abrir();
    await casos.abrirCaso(numeroCaso);
    await casos.enviar('f-contacto', 'Llamé al cliente y le ofrecí una visita con existencias confirmadas.');
    await expect(casos.estado).toContainText('En seguimiento');
    await casos.enviar('f-actuacion', 'Coaching a la vendedora sobre tiempos de atención.');
    // Se espera a que la actuación aparezca en el historial: al guardarla, la ventana se vuelve a dibujar.
    await expect(casos.historial.filter({ hasText: 'Coaching a la vendedora sobre tiempos' })).toHaveCount(1);
    await casos.enviar('f-cierre', 'Se atendió al cliente en su siguiente visita y quedó conforme.');
    const confirmar = supervisor.locator('.ty-alerta.show');
    await expect(confirmar).toContainText('Cerrar');
    await confirmar.locator('[data-respuesta]').click();
    await expect(casos.estado).toContainText('Cerrado');
    await pausa(supervisor);
  });

  // 4. La vendedora lee su retroalimentación y confirma el coaching.
  await test.step('La vendedora marca Enterado y confirma el coaching', async () => {
    const sesionVendedora = await browser.newContext();
    const pagina = await sesionVendedora.newPage();
    await entrar(pagina, vendedora.correo, CLAVE_TEMPORAL);
    const retro = new PaginaRetroalimentacion(pagina);
    await retro.abrir();
    const tarjeta = retro.tarjeta(`COT-${numero}`);
    await expect(tarjeta).toContainText('Esperé mucho');
    await tarjeta.getByRole('button', { name: 'Enterado' }).click();
    await pagina.locator('[data-filtro="todas"]').click();
    await retro.tarjeta(`COT-${numero}`).getByRole('button', { name: /coaching/ }).click();
    await expect(retro.tarjeta(`COT-${numero}`)).toContainText('Coaching confirmado');
    await pausa(pagina);
    await sesionVendedora.close();
  });

  // 5. La gerencia ve el resultado en el tablero del día.
  await test.step('La gerencia revisa el tablero de indicadores', async () => {
    const sesionGerencia = await browser.newContext();
    const pagina = await sesionGerencia.newPage();
    await entrar(pagina, usuarios.gerente.correo);
    const tablero = new PaginaIndicadores(pagina);
    await tablero.abrir();
    await tablero.filtrar(() => tablero.periodo.selectOption({ label: 'Hoy' }));
    await tablero.filtrar(() => tablero.vendedor.selectOption(String(vendedora.id)));
    await expect(tablero.respuestas).toHaveText('1');
    await expect(tablero.insatisfechos).toHaveText('100.0 %');
    await expect(pagina.locator('#k-plazo')).toHaveText('100.0 %');
    await expect(tablero.expuesto).toHaveText('Q 8,500');
    await expect(pagina.locator('#voz')).toContainText('Esperé mucho para que me atendieran.');
    await expect(pagina.locator('#retro-vendedores')).toContainText('100.0 % leídas');
    await pausa(pagina, 3000);
    await sesionGerencia.close();
  });

  await Promise.all([sesionSupervisor.close(), sesionTableta.close()]);
});
