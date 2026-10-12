// Objetos de página: Usuarios y Catálogos (M02).
const { expect } = require('@playwright/test');

class PaginaUsuarios {
  constructor(page) {
    this.page = page;
    this.nuevo = page.locator('#nuevo-usuario');
    this.buscar = page.locator('#buscar');
    this.filas = page.locator('#tabla-usuarios tbody tr');
    this.dialogo = page.locator('#dialogo-usuario');
  }

  async abrir() {
    await this.page.goto('/usuarios.html');
    await expect(this.filas.first()).toBeVisible();
  }

  async crear({ nombres, apellidos, correo, perfil, supervisor, clave }) {
    await this.nuevo.click();
    // Esperar a que la ventana termine de abrir: al abrir, el cursor salta al primer campo.
    await expect(this.dialogo.getByLabel('Nombres')).toBeFocused();
    await this.dialogo.getByLabel('Nombres').fill(nombres);
    await this.dialogo.getByLabel('Apellidos').fill(apellidos);
    await this.dialogo.getByLabel('Correo').fill(correo);
    await this.dialogo.getByLabel('Perfil').selectOption(perfil);
    if (supervisor) await this.dialogo.getByLabel('Supervisor a cargo').selectOption({ label: supervisor });
    if (clave) await this.dialogo.getByLabel('Contraseña temporal').fill(clave);
    await this.dialogo.getByRole('button', { name: 'Guardar' }).click();
  }

  fila(texto) {
    return this.filas.filter({ hasText: texto });
  }
}

class PaginaCatalogos {
  constructor(page) {
    this.page = page;
    this.nueva = page.locator('#nueva-empresa');
    this.buscar = page.locator('#buscar');
    this.filas = page.locator('#tabla-empresas tbody tr');
    this.dialogo = page.locator('#dialogo-empresa');
  }

  async abrir() {
    await this.page.goto('/catalogos.html');
    await expect(this.filas.first()).toBeVisible();
  }

  async crear({ nombre, segmento, correo, nit, contacto }) {
    await this.nueva.click();
    await expect(this.dialogo.getByLabel('Nombre o razón social')).toBeFocused();
    await this.dialogo.getByLabel('Nombre o razón social').fill(nombre);
    await this.dialogo.getByLabel('Segmento').selectOption(segmento);
    if (nit) await this.dialogo.getByLabel('NIT').fill(nit);
    await this.dialogo.getByLabel('Correo empresarial').fill(correo);
    if (contacto) await this.dialogo.getByLabel('Persona de contacto').fill(contacto);
    await this.dialogo.getByRole('button', { name: 'Guardar' }).click();
  }
}

module.exports = { PaginaUsuarios, PaginaCatalogos };
