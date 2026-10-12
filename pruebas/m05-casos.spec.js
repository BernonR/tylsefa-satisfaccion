// M05 · Casos de servicio y notificaciones (CU-06): bandeja, primer contacto, actuaciones,
// cierre autorizado por segmento (RF10, RS06), escalamiento por plazo hábil, avisos (RF11)
// y retroalimentación del vendedor con acuse y coaching.
const crypto = require('node:crypto');
const { test, expect } = require('@playwright/test');
const { PaginaAcceso } = require('./paginas/acceso.pagina');
const { PaginaPanel } = require('./paginas/panel.pagina');
const { PaginaCasos, PaginaRetroalimentacion } = require('./paginas/casos.pagina');
const usuarios = require('./datos/usuarios.json');
const bd = require('./apoyo/bd');

const clave = () => process.env.CLAVE_PRUEBAS;
const azar = () => crypto.randomBytes(3).toString('hex');
const digitosNuevos = () => `9${String(crypto.randomInt(0, 100000)).padStart(5, '0')}`;
const CLAVE_TEMPORAL = 'Temporal2026x';

let supervisor;   // contexto con sesión del supervisor de prueba
let tableta;      // terminal activada
let idSupervisor;
let vendedor;     // { id, correo } vendedor temporal a cargo del supervisor de prueba
let minorista;
let mayorista;

async function contexto(browser, correo, contrasena = clave()) {
  const c = await browser.newContext();
  const r = await c.request.post('/api/sesion', { data: { correo, clave: contrasena } });
  expect(r.status()).toBe(200);
  return c;
}

async function entrar(page, correo, contrasena = clave()) {
  const acceso = new PaginaAcceso(page);
  await acceso.abrir();
  await acceso.ingresar(correo, contrasena);
  await new PaginaPanel(page).esperarCarga();
}

// Cotización registrada y calificada en la terminal; devuelve el caso creado.
async function crearCaso({ cliente = minorista, calificacion = 2, comentario = 'Prueba automática de caso' } = {}) {
  const digitos = digitosNuevos();
  expect((await supervisor.request.post('/api/cotizaciones', { data: { numero: digitos, monto: '4200', idVendedor: vendedor.id, idCliente: cliente.id } })).status()).toBe(201);
  const r = await tableta.request.post('/api/terminal/respuestas', { data: { numero: digitos, calificacion, compro: false, idMotivo: 1, comentario } });
  expect(r.status()).toBe(201);
  const { caso } = await r.json();
  const { rows: [fila] } = await bd.consulta(`SELECT cs.id_caso AS id, r.id_respuesta AS "idRespuesta" FROM caso_servicio cs
    JOIN encuesta_respuesta r ON r.id_respuesta = cs.id_respuesta WHERE cs.numero_caso = $1`, [caso.numero]);
  return { ...fila, numero: caso.numero, cotizacion: `COT-${digitos}` };
}

const notificaciones = async (idCaso) => (await bd.consulta(
  `SELECT n.tipo, n.canal, n.correo_destinatario AS correo, n.id_usuario_destinatario AS usuario, n.leida
     FROM notificacion n WHERE n.id_caso = $1 ORDER BY n.id_notificacion`, [idCaso])).rows;

test.beforeAll(async ({ browser }) => {
  const admin = await contexto(browser, usuarios.administrador.correo);
  const { rows: [sup] } = await bd.consulta('SELECT id_usuario FROM usuario WHERE correo = $1', [usuarios.supervisor.correo]);
  idSupervisor = sup.id_usuario;
  const correo = `m05-${azar()}@pruebas.tylsefa.com`;
  const alta = await admin.request.post('/api/usuarios', { data: { nombres: 'Vendedora', apellidos: 'Casos', correo, perfil: 'vendedor', idSupervisor, clave: CLAVE_TEMPORAL } });
  expect(alta.status()).toBe(201);
  vendedor = { id: (await alta.json()).id, correo };
  for (const segmento of ['minorista', 'mayorista']) {
    const r = await admin.request.post('/api/clientes', { data: { nombre: `Prueba automática M05 ${segmento} ${azar()}`, segmento, correo: 'm05@prueba.tylsefa.com', contacto: 'Contacto Prueba' } });
    expect(r.status()).toBe(201);
    if (segmento === 'minorista') minorista = (await r.json()).cliente; else mayorista = (await r.json()).cliente;
  }
  await admin.close();
  supervisor = await contexto(browser, usuarios.supervisor.correo);
  tableta = await contexto(browser, usuarios.supervisor.correo);
  expect((await tableta.request.post('/api/terminal/activar')).status()).toBe(200);
});

test.afterAll(async () => {
  await Promise.all([supervisor?.close(), tableta?.close()]);
  await bd.limpiarCatalogos();
});

test('CP-M05-01 el supervisor registra el contacto, una actuación y cierra el caso minorista', async ({ page }) => {
  const desde = new Date(Date.now() - 5000);
  const caso = await crearCaso();
  await entrar(page, usuarios.supervisor.correo);
  const pantalla = new PaginaCasos(page);
  await pantalla.abrir();
  await expect(pantalla.fila(caso.numero)).toContainText('Sin contacto');
  await pantalla.abrirCaso(caso.numero);
  await pantalla.enviar('f-contacto', 'Llamé al jefe de compras y acordamos una nueva visita.');
  await expect(pantalla.estado).toContainText('En seguimiento');
  await pantalla.enviar('f-actuacion', 'Coaching a la vendedora sobre confirmar existencias.');
  await expect(pantalla.historial).toHaveCount(3);
  await pantalla.enviar('f-cierre', 'Se entregó el producto con descuento y el cliente quedó conforme.');
  await page.locator('.ty-alerta [data-respuesta]').click();
  await expect(pantalla.estado).toContainText('Cerrado');
  await expect(pantalla.dialogo.locator('.ty-resolucion')).toContainText('cliente quedó conforme');

  await expect.poll(async () => (await notificaciones(caso.id)).map((n) => n.tipo))
    .toEqual(expect.arrayContaining(['caso_asignado', 'caso_cliente', 'caso_cerrado']));
  for (const accion of ['primer_contacto_caso', 'actuacion_caso', 'cierre_caso']) {
    expect(await bd.ultimaAccion(usuarios.supervisor.correo, accion, desde), accion).not.toBeNull();
  }
});

test('CP-M05-02 no se cierra sin primer contacto ni sin una resolución completa', async () => {
  const caso = await crearCaso();
  const cerrar = (resolucion) => supervisor.request.post(`/api/casos/${caso.id}/cerrar`, { data: { resolucion } });
  expect((await cerrar('Se resolvió todo con el cliente.')).status()).toBe(409);
  expect((await supervisor.request.post(`/api/casos/${caso.id}/contacto`, { data: { nota: 'ok' } })).status()).toBe(400);
  expect((await supervisor.request.post(`/api/casos/${caso.id}/contacto`, { data: { nota: 'Llamada al cliente' } })).status()).toBe(200);
  expect((await supervisor.request.post(`/api/casos/${caso.id}/contacto`, { data: { nota: 'Segunda llamada' } })).status()).toBe(409);
  expect((await cerrar('Listo')).status()).toBe(400);
  expect((await cerrar('Se resolvió todo con el cliente.')).status()).toBe(200);
  expect((await supervisor.request.post(`/api/casos/${caso.id}/actuaciones`, { data: { descripcion: 'Después del cierre' } })).status()).toBe(409);
});

test('CP-M05-03 el caso mayorista lo cierra la gerencia; el supervisor solo da seguimiento', async ({ browser }) => {
  const caso = await crearCaso({ cliente: mayorista, calificacion: 1 });
  expect((await supervisor.request.get(`/api/casos/${caso.id}`)).status()).toBe(200);
  expect((await supervisor.request.post(`/api/casos/${caso.id}/contacto`, { data: { nota: 'El supervisor llamó primero' } })).status()).toBe(200);
  const r = await supervisor.request.post(`/api/casos/${caso.id}/cerrar`, { data: { resolucion: 'El supervisor intenta cerrar el caso.' } });
  expect(r.status()).toBe(403);
  const gerente = await contexto(browser, usuarios.gerente.correo);
  const detalle = (await (await gerente.request.get(`/api/casos/${caso.id}`)).json()).caso;
  expect(detalle.puedeCerrar).toBe(true);
  expect((await gerente.request.post(`/api/casos/${caso.id}/cerrar`, { data: { resolucion: 'La gerente acordó un nuevo plazo de entrega.' } })).status()).toBe(200);
  await gerente.close();
});

test('CP-M05-04 el vendedor no entra a los casos y un supervisor no ve casos ajenos', async ({ browser }) => {
  const caso = await crearCaso();
  const vend = await contexto(browser, vendedor.correo, CLAVE_TEMPORAL);
  expect((await vend.request.get('/api/casos')).status()).toBe(403);
  expect((await vend.request.post(`/api/casos/${caso.id}/cerrar`, { data: { resolucion: 'El vendedor intenta cerrar su caso.' } })).status()).toBe(403);
  await vend.close();

  const admin = await contexto(browser, usuarios.administrador.correo);
  const otroCorreo = `m05-${azar()}@pruebas.tylsefa.com`;
  expect((await admin.request.post('/api/usuarios', { data: { nombres: 'Otro', apellidos: 'Supervisor', correo: otroCorreo, perfil: 'supervisor', clave: CLAVE_TEMPORAL } })).status()).toBe(201);
  await admin.close();
  const otro = await contexto(browser, otroCorreo, CLAVE_TEMPORAL);
  expect((await otro.request.get(`/api/casos/${caso.id}`)).status()).toBe(404);
  const lista = (await (await otro.request.get('/api/casos?estado=')).json()).casos;
  expect(lista.some((c) => c.id === caso.id)).toBe(false);
  await otro.close();
});

test('CP-M05-05 al vencer el plazo de primer contacto el caso se escala a la gerencia', async () => {
  const caso = await crearCaso();
  await bd.consulta("UPDATE caso_servicio SET fecha_hora_creacion = now() - interval '4 days' WHERE id_caso = $1", [caso.id]);
  const lista = (await (await supervisor.request.get(`/api/casos?buscar=${caso.numero}`)).json()).casos;
  expect(lista[0]).toMatchObject({ estado: 'escalado', plazo: 'vencido' });
  const { rows: [c] } = await bd.consulta(`SELECT p.nombre AS perfil FROM caso_servicio cs JOIN usuario u ON u.id_usuario = cs.id_usuario_copia
    JOIN perfil p ON p.id_perfil = u.id_perfil WHERE cs.id_caso = $1`, [caso.id]);
  expect(c.perfil).toBe('gerente');
  // Los avisos salen en segundo plano: se espera a que queden registrados.
  await expect.poll(async () => (await notificaciones(caso.id)).filter((n) => n.tipo === 'caso_escalado').map((n) => n.canal).sort())
    .toEqual(['aplicacion', 'aplicacion', 'correo', 'correo']);
  // Escalado sigue esperando el primer contacto; al registrarlo pasa a seguimiento.
  expect((await supervisor.request.post(`/api/casos/${caso.id}/contacto`, { data: { nota: 'Contacto tardío con el cliente' } })).status()).toBe(200);
});

test('CP-M05-06 los plazos se calculan en horas hábiles: un caso del viernes 16:00 debe contactarse el lunes a las 10:00', async () => {
  const caso = await crearCaso();
  await bd.consulta("UPDATE caso_servicio SET fecha_hora_creacion = '2026-10-16T16:00:00-06:00' WHERE id_caso = $1", [caso.id]);
  const { caso: detalle } = await (await supervisor.request.get(`/api/casos/${caso.id}`)).json();
  expect(new Date(detalle.venceContacto).toISOString()).toBe(new Date('2026-10-19T10:00:00-06:00').toISOString());
  // 48 horas hábiles: 1 h del viernes, 45 h de lunes a viernes y 2 h del lunes siguiente.
  expect(new Date(detalle.venceCierre).toISOString()).toBe(new Date('2026-10-26T10:00:00-06:00').toISOString());
});

test('CP-M05-07 avisos: el responsable ve el caso al entrar y el aviso queda leído al abrirlo', async ({ page }) => {
  const caso = await crearCaso();
  await expect.poll(async () => (await notificaciones(caso.id)).map((n) => `${n.tipo}:${n.canal}`))
    .toEqual(expect.arrayContaining(['caso_asignado:aplicacion', 'caso_asignado:correo', 'caso_cliente:correo', 'copia_vendedor:aplicacion', 'copia_vendedor:correo']));
  await entrar(page, usuarios.supervisor.correo);
  await expect(page.locator('.toast')).toContainText(caso.numero);
  await expect(page.locator('#menu li[data-modulo="casos"] .cuenta')).toBeVisible();
  const pantalla = new PaginaCasos(page);
  await pantalla.abrir();
  await pantalla.abrirCaso(caso.numero);
  await expect.poll(async () => (await notificaciones(caso.id)).filter((n) => n.canal === 'aplicacion' && n.usuario === idSupervisor).every((n) => n.leida)).toBe(true);
});

test('CP-M05-08 el vendedor lee su retroalimentación, marca Enterado y confirma el coaching al cerrarse el caso', async ({ page }) => {
  const desde = new Date(Date.now() - 5000);
  const caso = await crearCaso({ comentario: 'Comentario para la vendedora' });
  await entrar(page, vendedor.correo, CLAVE_TEMPORAL);
  const retro = new PaginaRetroalimentacion(page);
  await retro.abrir();
  await page.locator('[data-filtro="todas"]').click();
  const tarjeta = retro.tarjeta(caso.cotizacion);
  await expect(tarjeta).toContainText('Comentario para la vendedora');
  await expect(tarjeta).toContainText(caso.numero);
  // Antes del cierre no se puede confirmar el coaching.
  expect((await page.request.post(`/api/retroalimentacion/${caso.idRespuesta}/coaching`)).status()).toBe(409);
  await tarjeta.getByRole('button', { name: 'Enterado' }).click();
  await expect(tarjeta).toContainText('Leído el');

  await supervisor.request.post(`/api/casos/${caso.id}/contacto`, { data: { nota: 'Llamada al cliente' } });
  await supervisor.request.post(`/api/casos/${caso.id}/cerrar`, { data: { resolucion: 'Se dio coaching a la vendedora y se atendió al cliente.' } });
  // Con el caso cerrado vuelve a "Por leer" para pedir la confirmación del coaching.
  await page.reload();
  await retro.tarjeta(caso.cotizacion).getByRole('button', { name: 'Confirmo que recibí el coaching' }).click();
  await expect(retro.tarjeta(caso.cotizacion)).toHaveCount(0); // ya no queda nada pendiente en ella
  await page.locator('[data-filtro="todas"]').click();
  await expect(retro.tarjeta(caso.cotizacion)).toContainText('Coaching confirmado');
  expect(await bd.ultimaAccion(vendedor.correo, 'confirmacion_coaching', desde)).not.toBeNull();
  // No puede marcar retroalimentación de otro vendedor.
  const { rows: [ajena] } = await bd.consulta(`SELECT r.id_respuesta FROM encuesta_respuesta r JOIN cotizacion c ON c.id_cotizacion = r.id_cotizacion
    WHERE c.id_vendedor <> $1 LIMIT 1`, [vendedor.id]);
  if (ajena) expect((await page.request.post(`/api/retroalimentacion/${ajena.id_respuesta}/enterado`)).status()).toBe(409);
});

test('CP-M05-09 cuando el supervisor avanza un caso mayorista, la gerencia recibe el aviso por correo y en la aplicación', async () => {
  const caso = await crearCaso({ cliente: mayorista, calificacion: 2 });
  const { rows: [g] } = await bd.consulta('SELECT id_responsable FROM caso_servicio WHERE id_caso = $1', [caso.id]);
  expect((await supervisor.request.post(`/api/casos/${caso.id}/contacto`, { data: { nota: 'Llamé al cliente y ofrecí envío sin costo.' } })).status()).toBe(200);
  expect((await supervisor.request.post(`/api/casos/${caso.id}/actuaciones`, { data: { descripcion: 'Coaching al vendedor sobre existencias.' } })).status()).toBe(201);
  // La gerente (responsable) recibe ambos avances; quien los registró no se avisa a sí mismo.
  await expect.poll(async () => (await notificaciones(caso.id)).filter((n) => n.tipo === 'caso_actualizado' && n.usuario === g.id_responsable).map((n) => n.canal).sort())
    .toEqual(['aplicacion', 'aplicacion', 'correo', 'correo']);
  expect((await notificaciones(caso.id)).some((n) => n.tipo === 'caso_actualizado' && n.usuario === idSupervisor)).toBe(false);
});
