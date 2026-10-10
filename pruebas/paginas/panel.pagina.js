// Objeto de página: panel del personal (menú lateral, usuario y cierre de sesión).
const { expect } = require('@playwright/test');

class PaginaPanel {
  constructor(page) {
    this.page = page;
    this.menu = page.locator('#menu > li');
    this.perfil = page.locator('#perfil-usuario');
    this.salir = page.locator('#salir');
    this.alertaInactividad = page.locator('#alerta-inactividad');
  }

  async esperarCarga() {
    await expect(this.page).toHaveURL(/inicio\.html/);
    await expect(this.menu.first()).toBeVisible();
  }

  async modulosDelMenu() {
    return this.menu.evaluateAll((items) => items.map((li) => li.dataset.modulo));
  }
}

module.exports = { PaginaPanel };
