// Objeto de página: inicio de sesión.
const { expect } = require('@playwright/test');

class PaginaAcceso {
  constructor(page) {
    this.page = page;
    this.correo = page.getByLabel('Correo electrónico');
    this.clave = page.getByLabel('Contraseña', { exact: true });
    this.entrar = page.locator('#entrar');
    this.aviso = page.locator('#aviso');
  }

  async abrir() {
    await this.page.goto('/');
    await expect(this.entrar).toBeVisible();
  }

  async ingresar(correo, clave) {
    await this.correo.fill(correo);
    await this.clave.fill(clave);
    await this.entrar.click();
  }
}

module.exports = { PaginaAcceso };
