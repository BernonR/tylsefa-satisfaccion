// Objeto de página: Terminal de autoservicio (M04).
const { expect } = require('@playwright/test');

class PaginaTerminal {
  constructor(page) {
    this.page = page;
    this.terminal = page.locator('#terminal');
    this.visor = page.locator('#visor');
    this.mensaje = page.locator('#mensaje-numero');
    this.ficha = page.locator('#ficha');
    this.caso = page.locator('#caso');
    this.numeroCaso = page.locator('#numero-caso');
    this.plazoCaso = page.locator('#plazo-caso');
    this.textoListo = page.locator('#texto-listo');
    this.pendientes = page.locator('#pendientes');
  }

  async abrir() {
    await this.page.goto('/terminal.html');
    await this.enPaso('numero');
  }

  enPaso(paso) {
    return expect(this.terminal).toHaveAttribute('data-paso', paso);
  }

  // Se toca cada número en el teclado de la pantalla, como lo haría el cliente.
  async escribir(digitos) {
    for (const d of digitos) await this.page.locator(`.tecla[data-d="${d}"]`).click();
  }

  async ingresarNumero(digitos) {
    await this.escribir(digitos);
    await this.page.locator('#continuar').click();
  }

  async responder({ numero, calificacion, compro, motivo = 0, comentario = '' }) {
    await this.ingresarNumero(numero);
    await this.enPaso('calificacion');
    await this.page.locator(`#escala [data-valor="${calificacion}"]`).click();
    await this.enPaso('compra');
    await this.page.locator(`[data-compro="${compro ? 'si' : 'no'}"]`).click();
    if (!compro) {
      await this.enPaso('motivo');
      await this.page.locator('#motivos .opcion').nth(motivo).click();
    }
    await this.enPaso('comentario');
    if (comentario) await this.page.locator('#comentario').fill(comentario);
  }

  async enviar() {
    await this.page.locator('#enviar').click();
  }
}

module.exports = { PaginaTerminal };
