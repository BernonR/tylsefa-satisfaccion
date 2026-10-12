// Objeto de página: Cotizaciones (M03).
const { expect } = require('@playwright/test');

class PaginaCotizaciones {
  constructor(page) {
    this.page = page;
    this.titulo = page.locator('#titulo');
    this.nueva = page.locator('#nueva-cotizacion');
    this.buscar = page.locator('#buscar');
    this.filas = page.locator('#tabla-cotizaciones tbody tr');
    this.monto = page.locator('#k-monto');
    this.dialogo = page.locator('#dialogo-cotizacion');
    this.dialogoAnular = page.locator('#dialogo-anular');
  }

  async abrir() {
    await this.page.goto('/cotizaciones.html');
    await expect(this.filas.first()).toBeVisible();
    await expect(this.monto).not.toHaveText('—');
  }

  // numero: los 6 dígitos; vendedor y cliente: texto visible de la opción.
  async registrar({ numero, monto, vendedor, cliente, prueba = false }) {
    await this.nueva.click();
    // Esperar a que la ventana termine de abrir: al abrir, el cursor salta al número.
    await expect(this.dialogo.getByLabel('Número de cotización')).toBeFocused();
    await this.dialogo.getByLabel('Número de cotización').fill(numero);
    await this.dialogo.getByLabel('Monto cotizado').fill(monto);
    if (vendedor) await this.dialogo.getByLabel('Vendedor que atendió').selectOption({ label: vendedor });
    if (cliente) {
      await this.page.locator('#c-filtro-cliente').fill(cliente);
      const opcion = this.page.locator('#c-cliente option').filter({ hasText: cliente }).first();
      await this.page.locator('#c-cliente').selectOption({ value: await opcion.getAttribute('value') });
    }
    if (prueba) await this.page.locator('#c-prueba').check();
    await this.page.locator('#guardar-cotizacion').click();
  }

  async anular(numero, motivo) {
    await this.fila(numero).getByRole('button', { name: `Anular ${numero}` }).click();
    await expect(this.dialogoAnular.getByLabel('Motivo')).toBeFocused();
    await this.dialogoAnular.getByLabel('Motivo').fill(motivo);
    await this.page.locator('#confirmar-anular').click();
  }

  fila(texto) {
    return this.filas.filter({ hasText: texto });
  }
}

module.exports = { PaginaCotizaciones };
