// Objetos de página: Casos de servicio y Retroalimentación (M05).
const { expect } = require('@playwright/test');

class PaginaCasos {
  constructor(page) {
    this.page = page;
    this.filas = page.locator('#tabla-casos tbody tr');
    this.buscar = page.locator('#buscar');
    this.filtro = page.locator('#filtro-estado');
    this.dialogo = page.locator('#dialogo-caso');
    this.estado = page.locator('#caso-estado');
    this.historial = page.locator('.ty-historial li');
  }

  async abrir() {
    await this.page.goto('/casos.html');
    await expect(this.filas.first()).toBeVisible();
  }

  fila(texto) {
    return this.filas.filter({ hasText: texto });
  }

  async abrirCaso(numero) {
    await this.buscar.fill(numero);
    await expect(this.filas).toHaveCount(1);
    await this.fila(numero).click();
    await expect(this.dialogo.locator('#dialogo-caso-titulo')).toHaveText(numero);
  }

  async enviar(formulario, texto) {
    await this.page.locator(`#${formulario}-texto`).fill(texto);
    await this.page.locator(`#${formulario} button[type="submit"]`).click();
  }
}

class PaginaRetroalimentacion {
  constructor(page) {
    this.page = page;
    this.tarjetas = page.locator('.ty-retro-tarjeta');
  }

  async abrir() {
    await this.page.goto('/retroalimentacion.html');
    await expect(this.page.locator('#k-por-leer')).not.toHaveText('—');
  }

  tarjeta(texto) {
    return this.tarjetas.filter({ hasText: texto });
  }
}

module.exports = { PaginaCasos, PaginaRetroalimentacion };
