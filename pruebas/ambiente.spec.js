// Comprueba que el ambiente de desarrollo está completo:
// la interfaz abre y el servidor llega a la base de datos.
const { test, expect } = require('@playwright/test');

test.describe('Verificación del ambiente', () => {
  test('la pantalla de inicio de sesión abre', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Inicio de sesión/);
    await expect(page.getByRole('heading', { name: 'Satisfacción en tiempo real' })).toBeVisible();
    await expect(page.locator('#entrar')).toBeVisible();
  });

  test('el servidor se conecta a la base de datos', async ({ request }) => {
    const respuesta = await request.get('/salud');
    expect(respuesta.status(), 'Revise DATABASE_URL en backend/.env').toBe(200);
    const datos = await respuesta.json();
    expect(datos.base_de_datos).toBe('conectada');
    expect(datos.perfiles).toBe(4);
    expect(datos.zona_horaria, 'La base debe trabajar en hora de Guatemala').toBe('America/Guatemala');
  });
});
