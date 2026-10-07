// Configuración de las pruebas con Playwright.
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './pruebas',
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
