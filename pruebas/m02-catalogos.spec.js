// M02 · Catálogos de personal y empresas cliente (RS04 privilegio mínimo, RS08 bitácora).
const crypto = require('node:crypto');
const { test, expect } = require('@playwright/test');
const { PaginaAcceso } = require('./paginas/acceso.pagina');
const { PaginaPanel } = require('./paginas/panel.pagina');
const { PaginaUsuarios, PaginaCatalogos } = require('./paginas/catalogos.pagina');
const usuarios = require('./datos/usuarios.json');
const bd = require('./apoyo/bd');

const clave = () => process.env.CLAVE_PRUEBAS;
const azar = () => crypto.randomBytes(3).toString('hex');
const correoNuevo = () => `m02-${azar()}@pruebas.tylsefa.com`;
const CLAVE_TEMPORAL = 'Temporal2026x';

test.afterAll(() => bd.limpiarCatalogos());

async function entrar(page, perfil) {
  const acceso = new PaginaAcceso(page);
  await acceso.abrir();
  await acceso.ingresar(usuarios[perfil].correo, clave());
  await new PaginaPanel(page).esperarCarga();
}

async function sesionApi(request, perfil) {
  const r = await request.post('/api/sesion', { data: { correo: usuarios[perfil].correo, clave: clave() } });
  expect(r.status()).toBe(200);
}

async function idSupervisorDePrueba() {
  const { rows } = await bd.consulta('SELECT id_usuario FROM usuario WHERE correo = $1', [usuarios.supervisor.correo]);
  return rows[0].id_usuario;
}

test.describe('Usuarios', () => {
  test('CP-M02-01 el administrador crea un vendedor con supervisor y este puede iniciar sesión', async ({ page, browser }) => {
    const correo = correoNuevo();
    await entrar(page, 'administrador');
    const pantalla = new PaginaUsuarios(page);
    await pantalla.abrir();
    await pantalla.crear({ nombres: 'Vendedor', apellidos: `Prueba ${azar()}`, correo, perfil: 'vendedor', supervisor: `${usuarios.supervisor.nombres} ${usuarios.supervisor.apellidos}`, clave: CLAVE_TEMPORAL });
    await expect(page.locator('.toast')).toContainText('Usuario creado');
    await pantalla.buscar.fill(correo);
    await expect(pantalla.fila(correo)).toContainText(usuarios.supervisor.nombres);

    const otra = await browser.newPage();
    const acceso = new PaginaAcceso(otra);
    await acceso.abrir();
    await acceso.ingresar(correo, CLAVE_TEMPORAL);
    const panel = new PaginaPanel(otra);
    await panel.esperarCarga();
    expect(await panel.modulosDelMenu()).toEqual(usuarios.vendedor.menu);
    await otra.close();
  });

  test('CP-M02-02 no se acepta un correo repetido ni un vendedor sin supervisor', async ({ page }) => {
    await entrar(page, 'administrador');
    const pantalla = new PaginaUsuarios(page);
    await pantalla.abrir();
    await pantalla.crear({ nombres: 'Copia', apellidos: 'Prueba', correo: usuarios.gerente.correo, perfil: 'vendedor', clave: CLAVE_TEMPORAL });
    await expect(pantalla.dialogo.getByText('Ya existe un usuario con ese correo.')).toBeVisible();
    await expect(pantalla.dialogo.getByText('Elija el supervisor a cargo del vendedor.')).toBeVisible();
    await expect(pantalla.dialogo).toBeVisible();
  });

  test('CP-M02-03 un usuario desactivado ya no puede entrar y al reactivarlo sí', async ({ request, browser }) => {
    await sesionApi(request, 'administrador');
    const correo = correoNuevo();
    const alta = await request.post('/api/usuarios', { data: { nombres: 'Temporal', apellidos: 'Prueba', correo, perfil: 'gerente', clave: CLAVE_TEMPORAL } });
    expect(alta.status()).toBe(201);
    const { id } = await alta.json();

    expect((await request.patch(`/api/usuarios/${id}/estado`, { data: { activo: false } })).status()).toBe(200);
    const contexto = await browser.newContext();
    expect((await contexto.request.post('/api/sesion', { data: { correo, clave: CLAVE_TEMPORAL } })).status()).toBe(403);

    expect((await request.patch(`/api/usuarios/${id}/estado`, { data: { activo: true } })).status()).toBe(200);
    expect((await contexto.request.post('/api/sesion', { data: { correo, clave: CLAVE_TEMPORAL } })).status()).toBe(200);
    await contexto.close();
  });

  test('CP-M02-04 no se puede desactivar a un supervisor que tiene vendedores a cargo', async ({ request }) => {
    await sesionApi(request, 'administrador');
    const idSupervisor = await idSupervisorDePrueba();
    const vendedor = await request.post('/api/usuarios', {
      data: { nombres: 'A cargo', apellidos: 'Prueba', correo: correoNuevo(), perfil: 'vendedor', idSupervisor, clave: CLAVE_TEMPORAL },
    });
    expect(vendedor.status()).toBe(201);
    const r = await request.patch(`/api/usuarios/${idSupervisor}/estado`, { data: { activo: false } });
    expect(r.status()).toBe(409);
    expect((await r.json()).mensaje).toContain('vendedores a cargo');
  });

  test('CP-M02-05 al restablecer la contraseña, la anterior deja de funcionar', async ({ request, browser }) => {
    await sesionApi(request, 'administrador');
    const correo = correoNuevo();
    const { id } = await (await request.post('/api/usuarios', { data: { nombres: 'Clave', apellidos: 'Prueba', correo, perfil: 'gerente', clave: CLAVE_TEMPORAL } })).json();
    expect((await request.post(`/api/usuarios/${id}/contrasena`, { data: { clave: 'Restablecida2026' } })).status()).toBe(200);

    const contexto = await browser.newContext();
    expect((await contexto.request.post('/api/sesion', { data: { correo, clave: CLAVE_TEMPORAL } })).status()).toBe(401);
    expect((await contexto.request.post('/api/sesion', { data: { correo, clave: 'Restablecida2026' } })).status()).toBe(200);
    await contexto.close();
  });

  test('CP-M02-06 cada persona cambia su propia contraseña desde su menú', async ({ request, page }) => {
    await sesionApi(request, 'administrador');
    const correo = correoNuevo();
    await request.post('/api/usuarios', { data: { nombres: 'Propia', apellidos: 'Prueba', correo, perfil: 'gerente', clave: CLAVE_TEMPORAL } });

    const acceso = new PaginaAcceso(page);
    await acceso.abrir();
    await acceso.ingresar(correo, CLAVE_TEMPORAL);
    await new PaginaPanel(page).esperarCarga();
    await page.locator('#cambiar-clave').click();
    const dialogo = page.locator('#dialogo-clave');
    await dialogo.getByLabel('Contraseña actual').fill('Equivocada2026');
    await dialogo.getByLabel('Nueva contraseña', { exact: true }).fill('MiNueva2026');
    await dialogo.getByLabel('Repita la nueva contraseña').fill('MiNueva2026');
    await dialogo.getByRole('button', { name: 'Cambiar contraseña' }).click();
    await expect(dialogo.getByText('La contraseña actual no es correcta.')).toBeVisible();

    await dialogo.getByLabel('Contraseña actual').fill(CLAVE_TEMPORAL);
    await dialogo.getByRole('button', { name: 'Cambiar contraseña' }).click();
    await expect(page.locator('.toast')).toContainText('Su contraseña se cambió');
    expect((await page.request.post('/api/sesion', { data: { correo, clave: 'MiNueva2026' } })).status()).toBe(200);
  });

  test('CP-M02-07 un supervisor no puede administrar usuarios ni empresas (403)', async ({ request }) => {
    await sesionApi(request, 'supervisor');
    expect((await request.get('/api/usuarios')).status()).toBe(403);
    expect((await request.post('/api/usuarios', { data: { nombres: 'X', apellidos: 'Y', correo: correoNuevo(), perfil: 'gerente', clave: CLAVE_TEMPORAL } })).status()).toBe(403);
    expect((await request.post('/api/clientes', { data: { nombre: 'Prueba automática X', segmento: 'minorista', correo: 'x@prueba.tylsefa.com' } })).status()).toBe(403);
  });

  test('CP-M02-08 la bitácora registra el alta de usuario con quién la hizo', async ({ request }) => {
    const desde = new Date(Date.now() - 5000);
    await sesionApi(request, 'administrador');
    await request.post('/api/usuarios', { data: { nombres: 'Bitácora', apellidos: 'Prueba', correo: correoNuevo(), perfil: 'gerente', clave: CLAVE_TEMPORAL } });
    const registro = await bd.ultimaAccion(usuarios.administrador.correo, 'alta_usuario', desde);
    expect(registro, 'Debe existir alta_usuario hecha por el administrador').toBeTruthy();
  });
});

test.describe('Empresas cliente', () => {
  test('CP-M02-09 el administrador registra una empresa y el sistema le asigna el código', async ({ page }) => {
    const nombre = `Prueba automática ${azar()}`;
    await entrar(page, 'administrador');
    const pantalla = new PaginaCatalogos(page);
    await pantalla.abrir();
    await pantalla.crear({ nombre, segmento: 'mayorista', correo: 'compras@prueba.tylsefa.com', nit: '1234567-8', contacto: 'Contacto de prueba' });
    await expect(page.locator('.toast')).toContainText(/código CLI-\d{4}/);
    await pantalla.buscar.fill(nombre);
    await expect(pantalla.filas.filter({ hasText: nombre })).toContainText(/CLI-\d{4}/);
    await expect(pantalla.filas.filter({ hasText: nombre })).toContainText('Mayorista');
  });

  test('CP-M02-10 sin nombre, segmento ni correo válido no se registra', async ({ request }) => {
    await sesionApi(request, 'administrador');
    const r = await request.post('/api/clientes', { data: { nombre: '', segmento: 'otro', correo: 'sin-arroba' } });
    expect(r.status()).toBe(400);
    expect(Object.keys((await r.json()).errores).sort()).toEqual(['correo', 'nombre', 'segmento']);
  });

  test('CP-M02-11 el supervisor consulta el catálogo sin opciones de edición', async ({ page }) => {
    await entrar(page, 'supervisor');
    const pantalla = new PaginaCatalogos(page);
    await pantalla.abrir();
    await expect(pantalla.nueva).toBeHidden();
    await expect(page.locator('#tabla-empresas [data-accion]')).toHaveCount(0);
    await page.getByText('Personal', { exact: true }).click();
    await expect(page.locator('#tabla-personal tbody tr').first()).toBeVisible();
  });

  test('CP-M02-12 desactivar una empresa la saca del listado de activas', async ({ request }) => {
    await sesionApi(request, 'administrador');
    const nombre = `Prueba automática ${azar()}`;
    const { cliente } = await (await request.post('/api/clientes', { data: { nombre, segmento: 'minorista', correo: 'a@prueba.tylsefa.com' } })).json();
    expect((await request.patch(`/api/clientes/${cliente.id}/estado`, { data: { activo: false } })).status()).toBe(200);
    const activas = await (await request.get(`/api/clientes?buscar=${encodeURIComponent(nombre)}`)).json();
    expect(activas.clientes).toHaveLength(0);
    const todas = await (await request.get(`/api/clientes?buscar=${encodeURIComponent(nombre)}&estado=todos`)).json();
    expect(todas.clientes).toHaveLength(1);
  });
});
