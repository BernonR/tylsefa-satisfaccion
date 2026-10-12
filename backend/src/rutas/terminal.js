'use strict';

// M04 · Terminal de autoservicio (CU-05).
// La tableta se activa una vez con la sesión de un supervisor o del administrador; desde ahí
// solo puede validar números y registrar respuestas. El cliente no inicia sesión (RS07).

const express = require('express');
const config = require('../config');
const { exigirSesion, exigirPermiso } = require('../middleware/autenticacion');
const { leerCookies, cookieBorrada } = require('../seguridad/sesion');
const { crearAutorizacion, leerAutorizacion, cookieTerminal, cookieTerminalBorrada } = require('../seguridad/terminal');
const { crearFreno } = require('../seguridad/intentos');
const { validarRespuesta, numeroCotizacion } = require('../servicios/validacion');
const encuestas = require('../servicios/encuestas');
const bitacora = require('../servicios/bitacora');

const rutas = express.Router();
const activar = exigirPermiso('cotizacion.registrar', 'usuarios.administrar');
// Números probados al azar: 10 fallos en 15 minutos bloquean la tableta por ese lapso.
const freno = crearFreno({ maximo: 10, ventana: 15 * 60 * 1000 });
const SEGUNDOS_INACTIVIDAD = 60;
const NO_ENCONTRADA = 'No encontramos una cotización pendiente con ese número. Verifíquelo en su documento o consulte al personal.';

function exigirTerminal(req, res, next) {
  const datos = leerAutorizacion(leerCookies(req.headers.cookie)[config.terminal.nombreCookie], config.terminal);
  if (!datos) return res.status(401).json({ mensaje: 'Esta tableta no está activada como terminal.', codigo: 'sin_activar' });
  req.terminal = datos;
  next();
}

function plazoTexto(minutos) {
  if (!minutos) return null;
  return minutos < 60 ? `${minutos} minutos hábiles` : `${minutos / 60} horas hábiles`;
}

// ---------- Activación (personal) ----------
rutas.post('/activar', exigirSesion, activar, async (req, res) => {
  const { valor, datos } = crearAutorizacion(req.usuario.id_usuario, config.terminal);
  await bitacora.registrar({
    idUsuario: req.usuario.id_usuario, accion: 'activacion_terminal', entidad: 'terminal',
    detalle: `Terminal ${datos.id} activada hasta ${new Date(datos.exp).toISOString().slice(0, 10)}`,
  });
  await bitacora.registrar({ idUsuario: req.usuario.id_usuario, accion: 'cierre_sesion', entidad: 'sesion', detalle: 'Al activar la terminal' });
  // La sesión del personal se cierra: en la tableta queda solo la encuesta.
  res.setHeader('Set-Cookie', [cookieTerminal(valor, config.terminal), cookieBorrada(config.sesion)]);
  res.json({ mensaje: 'La tableta quedó activada como terminal.' });
});

rutas.delete('/activacion', exigirSesion, activar, async (req, res) => {
  const datos = leerAutorizacion(leerCookies(req.headers.cookie)[config.terminal.nombreCookie], config.terminal);
  if (datos) {
    await bitacora.registrar({ idUsuario: req.usuario.id_usuario, accion: 'desactivacion_terminal', entidad: 'terminal', detalle: `Terminal ${datos.id}` });
  }
  const previas = res.getHeader('Set-Cookie') || [];
  res.setHeader('Set-Cookie', [].concat(previas, cookieTerminalBorrada(config.terminal)));
  res.json({ mensaje: 'La tableta dejó de funcionar como terminal.' });
});

// ---------- Encuesta (terminal activada) ----------
rutas.get('/estado', exigirTerminal, async (req, res) => {
  res.json({ activa: true, hasta: new Date(req.terminal.exp).toISOString(), segundosInactividad: SEGUNDOS_INACTIVIDAD, motivos: await encuestas.motivos() });
});

rutas.post('/validar', exigirTerminal, async (req, res) => {
  if (freno.bloqueado(req.ip, req.terminal.id)) {
    return res.status(429).json({ mensaje: 'Se ingresaron demasiados números incorrectos. Espere unos minutos o consulte al personal.' });
  }
  const numero = numeroCotizacion(req.body?.numero);
  const cotizacion = /^COT-\d{6}$/.test(numero) ? await encuestas.buscarPendiente(numero) : null;
  if (!cotizacion) {
    freno.fallo(req.ip, req.terminal.id);
    return res.status(404).json({ mensaje: NO_ENCONTRADA });
  }
  freno.exito(req.ip, req.terminal.id);
  res.json({ cotizacion });
});

rutas.post('/respuestas', exigirTerminal, async (req, res) => {
  const { errores, limpio } = validarRespuesta(req.body);
  if (Object.keys(errores).length) return res.status(400).json({ mensaje: 'La respuesta está incompleta.', errores });
  if (limpio.idMotivo && !(await encuestas.motivos()).some((m) => m.id === limpio.idMotivo)) {
    return res.status(400).json({ mensaje: 'La respuesta está incompleta.', errores: { idMotivo: 'Elija el motivo.' } });
  }
  const r = await encuestas.registrar(limpio);
  // Ya calificada, anulada, vencida o inexistente: no se revela cuál (CU-05, flujo alterno).
  if (!r) return res.status(409).json({ mensaje: NO_ENCONTRADA });

  await bitacora.registrar({
    accion: 'respuesta_encuesta', entidad: 'encuesta_respuesta', idRegistro: r.idRespuesta,
    detalle: `${r.numero}: calificación ${limpio.calificacion}, ${limpio.compro ? 'compró' : 'no compró'} (terminal ${req.terminal.id})`,
  });
  if (r.idCaso) {
    await bitacora.registrar({
      accion: 'generacion_caso', entidad: 'caso_servicio', idRegistro: r.idCaso,
      detalle: `${r.numeroCaso} por ${r.numero} (${r.segmento})`,
    });
  }
  res.status(201).json({
    mensaje: 'Gracias por su respuesta.',
    caso: r.idCaso ? { numero: r.numeroCaso, plazo: plazoTexto(r.minutosPrimerContacto) } : null,
  });
});

module.exports = rutas;
