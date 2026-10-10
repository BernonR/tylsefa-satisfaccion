// Configuración de las pruebas con Playwright.
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './pruebas',
  testMatch: '**/*.spec.js',
  // Crea las cuentas de prueba en la base de desarrollo antes de empezar.
  globalSetup: require.resolve('./pruebas/apoyo/preparar.js'),
  workers: 1,
  fullyParallel: false,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:3000',
    locale: 'es-GT',
    timezoneId: 'America/Guatemala',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  // Playwright enciende el servidor si no está encendido ya.
  webServer: {
    command: 'npm start --prefix backend',
    url: 'http://localhost:3000/',
    reuseExistingServer: true,
    timeout: 30000,
  },
});
