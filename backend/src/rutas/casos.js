'use strict';

// M05 · Casos de servicio (CU-06). Supervisor y gerente: bandeja, primer contacto,
// actuaciones y cierre autorizado según el segmento. El vendedor no entra (RS06).

const express = require('express');
const { exigirSesion, exigirPermiso } = require('../middleware/autenticacion');
const { identificador, validarTextoCaso } = require('../servicios/validacion');
const casos = require('../servicios/casos');
const avisos = require('../servicios/avisos');
const bitacora = require('../servicios/bitacora');

const rutas = express.Router();
rutas.use(exigirSesion, exigirPermiso('caso.atender'));
const invalido = (res, campo, error) => res.status(400).json({ mensaje: 'Revise los datos marcados.', errores: { [campo]: error } });

// Antes de mostrar la bandeja se escalan los casos vencidos (además de la revisión de cada minuto).
async function revisarVencidos() {
  for (const id of await casos.escalarVencidos()) {
    await bitacora.registrar({ accion: 'escalamiento_caso', entidad: 'caso_servicio', idRegistro: id, detalle: 'Venció el plazo de primer contacto' });
    avisos.enSegundoPlano(avisos.casoEscalado(id));
  }
}

async function cargar(req, res) {
  const id = identificador(req.params.id);
  const caso = id && await casos.obtener(id);
  if (!caso || !casos.puedeVer(req.usuario, caso)) {
    res.status(404).json({ mensaje: 'No se encontró el caso.' });
    return null;
  }
  return caso;
}

rutas.get('/', async (req, res) => {
  await revisarVencidos();
  const texto = (v) => (typeof v === 'string' ? v.trim().slice(0, 60) : '');
  res.json({ casos: await casos.listar(req.usuario, { estado: texto(req.query.estado), buscar: texto(req.query.buscar) }) });
});

rutas.get('/:id', async (req, res) => {
  const caso = await cargar(req, res);
  if (!caso) return;
  await avisos.marcarLeidos(caso.id, req.usuario.id_usuario);
  res.json({ caso: { ...(await casos.detalle(caso.id)), puedeContactar: casos.puedeContactar(req.usuario, caso), puedeCerrar: casos.puedeCerrar(req.usuario, caso) } });
});

rutas.post('/:id/contacto', async (req, res) => {
  const caso = await cargar(req, res);
  if (!caso) return;
  if (!casos.puedeContactar(req.usuario, caso)) {
    return res.status(403).json({ mensaje: 'En los casos de clientes mayoristas el primer contacto lo registra la gerencia.' });
  }
  const { texto, error } = validarTextoCaso(req.body?.nota, 5, 500, 'cómo contactó al cliente y qué le dijo');
  if (error) return invalido(res, 'nota', error);
  if (!(await casos.registrarContacto(caso.id, req.usuario.id_usuario, texto))) {
    return res.status(409).json({ mensaje: 'El primer contacto ya estaba registrado o el caso está cerrado.' });
  }
  await bitacora.registrar({ idUsuario: req.usuario.id_usuario, accion: 'primer_contacto_caso', entidad: 'caso_servicio', idRegistro: caso.id, detalle: caso.numero });
  avisos.enSegundoPlano(avisos.casoActualizado(caso.id, req.usuario.id_usuario, 'contacto', texto));
  res.json({ mensaje: `Primer contacto registrado en ${caso.numero}.` });
});

rutas.post('/:id/actuaciones', async (req, res) => {
  const caso = await cargar(req, res);
  if (!caso) return;
  const { texto, error } = validarTextoCaso(req.body?.descripcion, 5, 1000, 'la actuación');
  if (error) return invalido(res, 'descripcion', error);
  if (!(await casos.agregarActuacion(caso.id, req.usuario.id_usuario, texto))) return res.status(409).json({ mensaje: 'El caso ya está cerrado.' });
  await bitacora.registrar({ idUsuario: req.usuario.id_usuario, accion: 'actuacion_caso', entidad: 'caso_servicio', idRegistro: caso.id, detalle: caso.numero });
  avisos.enSegundoPlano(avisos.casoActualizado(caso.id, req.usuario.id_usuario, 'actuacion', texto));
  res.status(201).json({ mensaje: 'Actuación registrada.' });
});

rutas.post('/:id/cerrar', async (req, res) => {
  const caso = await cargar(req, res);
  if (!caso) return;
  if (!casos.puedeCerrar(req.usuario, caso)) {
    return res.status(403).json({ mensaje: 'Los casos de clientes mayoristas los cierra la gerencia.' });
  }
  const { texto, error } = validarTextoCaso(req.body?.resolucion, 10, 1000, 'la resolución que se le dio al cliente');
  if (error) return invalido(res, 'resolucion', error);
  if (!caso.contactado) return res.status(409).json({ mensaje: 'Registre primero el contacto con el cliente.' });
  if (!(await casos.cerrar(caso.id, req.usuario.id_usuario, texto))) return res.status(409).json({ mensaje: 'El caso ya estaba cerrado.' });
  await bitacora.registrar({ idUsuario: req.usuario.id_usuario, accion: 'cierre_caso', entidad: 'caso_servicio', idRegistro: caso.id, detalle: caso.numero });
  avisos.enSegundoPlano(avisos.casoCerrado(caso.id));
  avisos.enSegundoPlano(avisos.casoActualizado(caso.id, req.usuario.id_usuario, 'cierre', texto));
  res.json({ mensaje: `${caso.numero} cerrado. El cliente recibirá la resolución por correo.` });
});

module.exports = { rutas, revisarVencidos };
