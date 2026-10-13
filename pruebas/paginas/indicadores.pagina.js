// Objeto de página: Tablero de indicadores (M06).
const { expect } = require('@playwright/test');

class PaginaIndicadores {
  constructor(page) {
    this.page = page;
    this.tablero = page.locator('#tablero');
    this.periodo = page.locator('#f-periodo');
    this.segmento = page.locator('#f-segmento');
    this.vendedor = page.locator('#f-vendedor');
    this.cajaVendedor = page.locator('#caja-vendedor');
    this.pruebas = page.locator('#f-pruebas');
    this.cajaPruebas = page.locator('#caja-pruebas');
    this.avisoPruebas = page.locator('#aviso-pruebas');
    this.satisfechos = page.locator('#k-satisfechos');
    this.insatisfechos = page.locator('#k-insatisfechos');
    this.respuestas = page.locator('#k-respuestas');
    this.expuesto = page.locator('#k-expuesto');
    this.vendedores = page.locator('#panel-vendedores');
    this.motivos = page.locator('#g-motivos');
  }

  async abrir() {
    await this.page.goto('/indicadores.html');
    await this.esperar();
  }

  async esperar() {
    await expect(this.tablero).toHaveAttribute('aria-busy', 'false');
  }

  // Cambia un filtro y espera a que el tablero termine de recalcular.
  async filtrar(accion) {
    const respuesta = this.page.waitForResponse((r) => r.url().includes('/api/indicadores'));
    await accion();
    await respuesta;
    await this.esperar();
  }
}

module.exports = { PaginaIndicadores };
