// M01 · Acceso y seguridad (CU-02, RS01, RS04, RS09, RS11).
// Las cuentas de prueba las crea pruebas/apoyo/preparar.js antes de empezar.
const crypto = require('node:crypto');
const { test, expect } = require('@playwright/test');
const { PaginaAcceso } = require('./paginas/acceso.pagina');
const { PaginaPanel } = require('./paginas/panel.pagina');
const usuarios = require('./datos/usuarios.json');
const bd = require('./apoyo/bd');

const clave = () => process.env.CLAVE_PRUEBAS;
const correoAlAzar = (prefijo) => `${prefijo}-${crypto.randomBytes(4).toString('hex')}@pruebas.tylsefa.com`;
const MENSAJE_GENERICO = 'El correo o la contraseña no son correctos';

test.afterAll(() => bd.cerrar());

// En modo presentación se deja ver el resultado de cada prueba antes de pasar a la siguiente.
test.afterEach(async ({ page }) => {
  if (process.env.PRESENTACION) await page.waitForTimeout(2000);
});

test.describe('Inicio de sesión', () => {
  test('CP-M01-01 con campos vacíos se indican los errores y no se envía nada', async ({ page }) => {
    const acceso = new PaginaAcceso(page);
    await acceso.abrir();
    let solicitudes = 0;
    page.on('request', (r) => { if (r.url().endsWith('/api/sesion') && r.method() === 'POST') solicitudes++; });
    await acceso.entrar.click();
    await expect(acceso.correo).toHaveAttribute('aria-invalid', 'true');
    await expect(acceso.clave).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByText('Escriba un correo válido')).toBeVisible();
    expect(solicitudes).toBe(0);
  });

  test('CP-M01-02 con credenciales incorrectas se muestra un mensaje que no revela cuál dato falló', async ({ page }) => {
    const acceso = new PaginaAcceso(page);
    await acceso.abrir();
    await acceso.ingresar(correoAlAzar('noexiste'), 'ClaveIncorrecta1');
    await expect(acceso.aviso).toContainText(MENSAJE_GENERICO);
    await expect(page).not.toHaveURL(/inicio\.html/);
    await expect(acceso.clave).toHaveValue('');
  });

  for (const perfil of ['vendedor', 'supervisor', 'gerente', 'administrador']) {
    test(`CP-M01-03 el ${perfil} entra y ve solo los módulos de su perfil`, async ({ page }) => {
      const u = usuarios[perfil];
      const acceso = new PaginaAcceso(page);
      const panel = new PaginaPanel(page);
      await acceso.abrir();
      await acceso.ingresar(u.correo, clave());
      await panel.esperarCarga();
      expect(await panel.modulosDelMenu()).toEqual(u.menu);
      await expect(panel.perfil).toHaveText(perfil.charAt(0).toUpperCase() + perfil.slice(1));
      await expect(page.getByRole('heading', { level: 1 })).toContainText(u.nombres);
    });
  }

  test('CP-M01-04 una cuenta desactivada no puede entrar', async ({ page }) => {
    const acceso = new PaginaAcceso(page);
    await acceso.abrir();
    await acceso.ingresar(usuarios.inactivo.correo, clave());
    await expect(acceso.aviso).toContainText('Su cuenta está desactivada');
    await expect(page).not.toHaveURL(/inicio\.html/);
  });
});

test.describe('Sesión y permisos', () => {
  test('CP-M01-05 una página interna sin sesión regresa al inicio de sesión', async ({ page }) => {
    await page.goto('/inicio.html');
    await expect(page).toHaveURL(/index\.html\?motivo=sesion/);
    await expect(page.locator('#aviso')).toContainText('Inicie sesión para continuar');
  });

  test('CP-M01-06 al cerrar sesión el servidor ya no acepta la cookie', async ({ page }) => {
    const acceso = new PaginaAcceso(page);
    const panel = new PaginaPanel(page);
    await acceso.abrir();
    await acceso.ingresar(usuarios.supervisor.correo, clave());
    await panel.esperarCarga();
    await panel.salir.click();
    await expect(page).toHaveURL(/motivo=salida/);
    const respuesta = await page.request.get('/api/sesion');
    expect(respuesta.status()).toBe(401);
  });

  test('CP-M01-07 la cookie de sesión es HttpOnly y SameSite', async ({ page, context }) => {
    const acceso = new PaginaAcceso(page);
    await acceso.abrir();
    await acceso.ingresar(usuarios.gerente.correo, clave());
    await new PaginaPanel(page).esperarCarga();
    const cookie = (await context.cookies()).find((c) => c.name === 'tylsefa_sesion');
    expect(cookie, 'Debe existir la cookie de sesión').toBeTruthy();
    expect(cookie.httpOnly).toBe(true);
    expect(cookie.sameSite).toBe('Lax');
    expect(await page.evaluate(() => document.cookie)).not.toContain('tylsefa_sesion');
  });

  test('CP-M01-08 el servidor niega a un vendedor la lista de usuarios (privilegio mínimo)', async ({ request }) => {
    const entrar = await request.post('/api/sesion', { data: { correo: usuarios.vendedor.correo, clave: clave() } });
    expect(entrar.status()).toBe(200);
    expect((await request.get('/api/usuarios')).status()).toBe(403);
  });

  test('CP-M01-09 el administrador obtiene la lista de usuarios sin resúmenes de contraseña', async ({ request }) => {
    await request.post('/api/sesion', { data: { correo: usuarios.administrador.correo, clave: clave() } });
    const respuesta = await request.get('/api/usuarios');
    expect(respuesta.status()).toBe(200);
    const texto = await respuesta.text();
    expect(texto).toContain(usuarios.vendedor.correo);
    expect(texto).not.toMatch(/hash|scrypt/i);
  });
});

test.describe('Seguridad', () => {
  test('CP-M01-10 un intento de inyección SQL no permite entrar', async ({ request }) => {
    const respuesta = await request.post('/api/sesion', {
      data: { correo: `x'OR'1'='1'--${correoAlAzar('sql')}`, clave: "' OR '1'='1" },
    });
    expect(respuesta.status()).toBe(401);
    expect((await respuesta.json()).mensaje).toContain(MENSAJE_GENERICO);
    const { rows } = await bd.consulta('SELECT count(*)::int AS n FROM usuario WHERE correo = $1', [usuarios.vendedor.correo]);
    expect(rows[0].n).toBe(1);
  });

  test('CP-M01-11 tras 5 intentos fallidos se bloquea el correo durante 15 minutos', async ({ request }) => {
    const correo = correoAlAzar('bloqueo');
    for (let i = 0; i < 5; i++) {
      expect((await request.post('/api/sesion', { data: { correo, clave: 'Incorrecta1' } })).status()).toBe(401);
    }
    const sexto = await request.post('/api/sesion', { data: { correo, clave: 'Incorrecta1' } });
    expect(sexto.status()).toBe(429);
    expect((await sexto.json()).mensaje).toContain('Espere 15 minutos');
  });

  test('CP-M01-12 la bitácora registra el inicio de sesión en hora de Guatemala', async ({ page }) => {
    const desde = new Date(Date.now() - 5000);
    const acceso = new PaginaAcceso(page);
    await acceso.abrir();
    await acceso.ingresar(usuarios.vendedor.correo, clave());
    await new PaginaPanel(page).esperarCarga();
    const registro = await bd.ultimaAccion(usuarios.vendedor.correo, 'inicio_sesion', desde);
    expect(registro, 'Debe existir el registro en bitacora_auditoria').toBeTruthy();
    expect(registro.zona, 'UTC-6, hora de Guatemala').toBe(-6);
  });

  test('CP-M01-13 tras 14 minutos sin actividad avisa y a los 15 cierra la sesión (RS11)', async ({ page }) => {
    const desde = new Date(Date.now() - 5000);
    await page.clock.install();
    const acceso = new PaginaAcceso(page);
    const panel = new PaginaPanel(page);
    await acceso.abrir();
    await acceso.ingresar(usuarios.supervisor.correo, clave());
    await panel.esperarCarga();

    await page.clock.fastForward('13:50');
    await expect(panel.alertaInactividad).toBeHidden();
    await page.clock.fastForward('00:15');
    await expect(panel.alertaInactividad).toBeVisible();
    await expect(panel.alertaInactividad).toContainText('¿Sigue ahí?');

    await page.clock.fastForward('01:00');
    await expect(page).toHaveURL(/motivo=inactividad/);
    await expect(page.locator('#aviso')).toContainText('15 minutos sin actividad');
    await expect.poll(() => bd.ultimaAccion(usuarios.supervisor.correo, 'cierre_por_inactividad', desde)).toBeTruthy();
  });

  test('CP-M01-14 elegir "Seguir conectado" mantiene la sesión abierta', async ({ page }) => {
    await page.clock.install();
    const acceso = new PaginaAcceso(page);
    const panel = new PaginaPanel(page);
    await acceso.abrir();
    await acceso.ingresar(usuarios.gerente.correo, clave());
    await panel.esperarCarga();
    await page.clock.fastForward('14:05');
    await expect(panel.alertaInactividad).toBeVisible();
    await page.getByRole('button', { name: 'Seguir conectado' }).click();
    await expect(panel.alertaInactividad).toBeHidden();
    await page.clock.fastForward('05:00');
    await expect(page).toHaveURL(/inicio\.html/);
  });
});
