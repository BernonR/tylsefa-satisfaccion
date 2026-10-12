// M03 · Cotizaciones (CU-04): registro por el supervisor, corrección, anulación con motivo y consulta por perfil.
const crypto = require('node:crypto');
const { test, expect } = require('@playwright/test');
const { PaginaAcceso } = require('./paginas/acceso.pagina');
const { PaginaPanel } = require('./paginas/panel.pagina');
const { PaginaCotizaciones } = require('./paginas/cotizaciones.pagina');
const usuarios = require('./datos/usuarios.json');
const bd = require('./apoyo/bd');

const clave = () => process.env.CLAVE_PRUEBAS;
const azar = () => crypto.randomBytes(3).toString('hex');
// Las pruebas usan números que empiezan con 9 para distinguirlos de los reales.
const numeroNuevo = () => `9${String(crypto.randomInt(0, 100000)).padStart(5, '0')}`;
const VENDEDOR = `${usuarios.vendedor.nombres} ${usuarios.vendedor.apellidos}`;
const CLAVE_TEMPORAL = 'Temporal2026x';

let cliente;      // empresa cliente creada para estas pruebas
let idVendedor;   // vendedor de prueba (Valeria Prueba)

async function contexto(browser, correo, contrasena = clave()) {
  const c = await browser.newContext();
  const r = await c.request.post('/api/sesion', { data: { correo, clave: contrasena } });
  expect(r.status()).toBe(200);
  return c;
}

async function entrar(page, perfil) {
  const acceso = new PaginaAcceso(page);
  await acceso.abrir();
  await acceso.ingresar(usuarios[perfil].correo, clave());
  await new PaginaPanel(page).esperarCarga();
}

// Registra por la API como supervisor y devuelve el id y el número completo.
async function registrarApi(request, datos = {}) {
  const numero = datos.numero || numeroNuevo();
  const r = await request.post('/api/cotizaciones', { data: { numero, monto: '1500', idVendedor, idCliente: cliente.id, ...datos } });
  expect(r.status()).toBe(201);
  return { id: (await r.json()).id, numero: `COT-${numero}` };
}

test.beforeAll(async ({ browser }) => {
  const admin = await contexto(browser, usuarios.administrador.correo);
  const r = await admin.request.post('/api/clientes', { data: { nombre: `Prueba automática M03 ${azar()}`, segmento: 'minorista', correo: 'm03@prueba.tylsefa.com' } });
  expect(r.status()).toBe(201);
  cliente = (await r.json()).cliente;
  await admin.close();
  const { rows } = await bd.consulta('SELECT id_usuario FROM usuario WHERE correo = $1', [usuarios.vendedor.correo]);
  idVendedor = rows[0].id_usuario;
});

test.afterAll(() => bd.limpiarCatalogos());

test('CP-M03-01 el supervisor registra una cotización y queda pendiente con el monto en quetzales', async ({ page }) => {
  const numero = numeroNuevo();
  await entrar(page, 'supervisor');
  const pantalla = new PaginaCotizaciones(page);
  await pantalla.abrir();
  await pantalla.registrar({ numero, monto: 'Q 12,480.5', vendedor: VENDEDOR, cliente: cliente.nombre });
  await expect(page.locator('.toast')).toContainText(`COT-${numero} registrada`);
  const fila = pantalla.fila(`COT-${numero}`);
  await expect(fila).toContainText(/Q\s?12,480\.50/);
  await expect(fila).toContainText('Pendiente');
  await expect(fila).toContainText(cliente.nombre);
});

test('CP-M03-02 no se acepta un número repetido ni con formato distinto a COT y 6 dígitos', async ({ page, request }) => {
  await request.post('/api/sesion', { data: { correo: usuarios.supervisor.correo, clave: clave() } });
  const { numero } = await registrarApi(request);

  await entrar(page, 'supervisor');
  const pantalla = new PaginaCotizaciones(page);
  await pantalla.abrir();
  await pantalla.registrar({ numero: numero.replace('COT-', ''), monto: '800', vendedor: VENDEDOR, cliente: cliente.nombre });
  await expect(pantalla.dialogo.getByText('Ese número de cotización ya está registrado.')).toBeVisible();
  await expect(pantalla.dialogo).toBeVisible();

  for (const malo of ['12AB', '1234567', 'COT-12']) {
    const r = await request.post('/api/cotizaciones', { data: { numero: malo, monto: '100', idVendedor, idCliente: cliente.id } });
    expect(r.status()).toBe(400);
    expect((await r.json()).errores).toHaveProperty('numero');
  }
});

test('CP-M03-03 el monto debe ser mayor que cero y se piden vendedor y cliente', async ({ page, request }) => {
  await entrar(page, 'supervisor');
  const pantalla = new PaginaCotizaciones(page);
  await pantalla.abrir();
  await pantalla.registrar({ numero: numeroNuevo(), monto: '0' });
  await expect(pantalla.dialogo.getByText('Escriba el monto cotizado; debe ser mayor que cero.')).toBeVisible();
  await expect(pantalla.dialogo.getByText('Elija el vendedor que atendió.')).toBeVisible();

  await request.post('/api/sesion', { data: { correo: usuarios.supervisor.correo, clave: clave() } });
  const r = await request.post('/api/cotizaciones', { data: { numero: numeroNuevo(), monto: '-50', idVendedor, idCliente: cliente.id } });
  expect(r.status()).toBe(400);
  expect(Object.keys((await r.json()).errores)).toEqual(['monto']);
});

test('CP-M03-04 se corrige mientras está pendiente; anulada ya no se corrige ni se anula otra vez', async ({ page, request }) => {
  await request.post('/api/sesion', { data: { correo: usuarios.supervisor.correo, clave: clave() } });
  const { id, numero } = await registrarApi(request);
  const corregir = (monto) => request.put(`/api/cotizaciones/${id}`, { data: { numero: numero.replace('COT-', ''), monto, idVendedor, idCliente: cliente.id } });
  expect((await corregir('2750.25')).status()).toBe(200);

  await entrar(page, 'supervisor');
  const pantalla = new PaginaCotizaciones(page);
  await pantalla.abrir();
  await expect(pantalla.fila(numero)).toContainText(/Q\s?2,750\.25/);
  await pantalla.anular(numero, 'El cliente pidió cambiar los productos cotizados');
  await expect(page.locator('.toast')).toContainText(`${numero} anulada`);
  await expect(pantalla.fila(numero)).toContainText('Anulada');
  await expect(pantalla.fila(numero)).toContainText('El cliente pidió cambiar');
  await expect(pantalla.fila(numero).getByRole('button')).toHaveCount(0);

  expect((await corregir('100')).status()).toBe(409);
  expect((await request.post(`/api/cotizaciones/${id}/anular`, { data: { motivo: 'Segundo intento' } })).status()).toBe(409);
  const sinMotivo = await request.post(`/api/cotizaciones/${(await registrarApi(request)).id}/anular`, { data: { motivo: 'no' } });
  expect(sinMotivo.status()).toBe(400);
});

test('CP-M03-05 el vendedor ve solo sus cotizaciones y no puede registrar', async ({ page, request, browser }) => {
  // Un segundo vendedor para comprobar que Valeria no ve cotizaciones ajenas.
  const admin = await contexto(browser, usuarios.administrador.correo);
  const { rows: [sup] } = await bd.consulta('SELECT id_usuario FROM usuario WHERE correo = $1', [usuarios.supervisor.correo]);
  const alta = await admin.request.post('/api/usuarios', { data: { nombres: 'Otro', apellidos: 'Vendedor', correo: `m03-${azar()}@pruebas.tylsefa.com`, perfil: 'vendedor', idSupervisor: sup.id_usuario, clave: CLAVE_TEMPORAL } });
  expect(alta.status()).toBe(201);
  const idOtro = (await alta.json()).id;
  await admin.close();

  await request.post('/api/sesion', { data: { correo: usuarios.supervisor.correo, clave: clave() } });
  const propia = await registrarApi(request);
  const ajena = await registrarApi(request, { idVendedor: idOtro });

  await entrar(page, 'vendedor');
  const pantalla = new PaginaCotizaciones(page);
  await pantalla.abrir();
  await expect(pantalla.titulo).toHaveText('Mis cotizaciones');
  await expect(pantalla.nueva).toBeHidden();
  await expect(pantalla.fila(propia.numero)).toHaveCount(1);
  await expect(pantalla.fila(ajena.numero)).toHaveCount(0);

  const vendedor = page.request;
  const lista = await (await vendedor.get('/api/cotizaciones')).json();
  expect(lista.cotizaciones.every((c) => c.idVendedor === idVendedor)).toBe(true);
  expect((await vendedor.post('/api/cotizaciones', { data: { numero: numeroNuevo(), monto: '10', idVendedor, idCliente: cliente.id } })).status()).toBe(403);
  expect((await vendedor.get('/api/cotizaciones/opciones')).status()).toBe(403);

  const gerente = await contexto(browser, usuarios.gerente.correo);
  const todas = await (await gerente.request.get(`/api/cotizaciones?buscar=${encodeURIComponent(cliente.nombre)}`)).json();
  expect(todas.cotizaciones.map((c) => c.numero)).toEqual(expect.arrayContaining([propia.numero, ajena.numero]));
  expect((await gerente.request.post('/api/cotizaciones', { data: {} })).status()).toBe(403);
  await gerente.close();
});

test('CP-M03-06 la bitácora registra el alta, la corrección y la anulación con quién las hizo', async ({ request }) => {
  const desde = new Date(Date.now() - 5000);
  await request.post('/api/sesion', { data: { correo: usuarios.supervisor.correo, clave: clave() } });
  const { id, numero } = await registrarApi(request);
  await request.put(`/api/cotizaciones/${id}`, { data: { numero: numero.replace('COT-', ''), monto: '1600', idVendedor, idCliente: cliente.id } });
  await request.post(`/api/cotizaciones/${id}/anular`, { data: { motivo: 'Registro duplicado por error' } });
  for (const accion of ['registro_cotizacion', 'correccion_cotizacion', 'anulacion_cotizacion']) {
    const fila = await bd.ultimaAccion(usuarios.supervisor.correo, accion, desde);
    expect(fila, accion).not.toBeNull();
    expect(fila.zona).toBe(-6);
  }
});

test('CP-M03-07 una cotización de prueba se marca y no suma al monto cotizado', async ({ page }) => {
  const numero = numeroNuevo();
  await entrar(page, 'supervisor');
  const pantalla = new PaginaCotizaciones(page);
  await pantalla.abrir();
  const antes = await pantalla.monto.textContent();
  await pantalla.registrar({ numero, monto: '99999', vendedor: VENDEDOR, cliente: cliente.nombre, prueba: true });
  await expect(pantalla.fila(`COT-${numero}`)).toContainText('Prueba');
  await expect(pantalla.monto).toHaveText(antes);
});
