'use strict';

// Reglas de validación de los catálogos (M02), las cotizaciones (M03) y la terminal (M04). Se usan en el servidor, que es quien decide;
// la pantalla repite las mismas reglas solo para avisar antes de enviar.

const { revisarPolitica } = require('../seguridad/contrasenas');

const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NIT = /^(\d{1,12}-?[\dkK]|CF)$/;
const PERFILES = ['vendedor', 'supervisor', 'gerente', 'administrador'];
const SEGMENTOS = ['minorista', 'mayorista'];

const texto = (v) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : '');

function requerido(errores, campo, valor, max, etiqueta) {
  if (!valor) errores[campo] = `Escriba ${etiqueta}.`;
  else if (valor.length > max) errores[campo] = `Use como máximo ${max} caracteres.`;
}

// Usuario del personal. "nuevo" exige la contraseña temporal.
function validarUsuario(datos = {}, { nuevo = false } = {}) {
  const errores = {};
  const limpio = {
    nombres: texto(datos.nombres),
    apellidos: texto(datos.apellidos),
    correo: texto(datos.correo).toLowerCase(),
    perfil: texto(datos.perfil),
    idSupervisor: datos.idSupervisor ? Number(datos.idSupervisor) : null,
  };
  requerido(errores, 'nombres', limpio.nombres, 60, 'los nombres');
  requerido(errores, 'apellidos', limpio.apellidos, 60, 'los apellidos');
  if (!CORREO.test(limpio.correo) || limpio.correo.length > 120) errores.correo = 'Escriba un correo válido, por ejemplo nombre@tylsefa.com.';
  if (!PERFILES.includes(limpio.perfil)) errores.perfil = 'Elija el perfil.';
  if (limpio.perfil === 'vendedor') {
    if (!Number.isInteger(limpio.idSupervisor) || limpio.idSupervisor <= 0) errores.idSupervisor = 'Elija el supervisor a cargo del vendedor.';
  } else {
    limpio.idSupervisor = null; // solo los vendedores tienen supervisor
  }
  if (nuevo) {
    const faltas = revisarPolitica(datos.clave);
    if (faltas.length) errores.clave = `La contraseña necesita ${faltas.join(', ')}.`;
    limpio.clave = typeof datos.clave === 'string' ? datos.clave : '';
  }
  return { errores, limpio, valido: Object.keys(errores).length === 0 };
}

// Empresa cliente. El código lo genera el sistema.
function validarCliente(datos = {}) {
  const errores = {};
  const limpio = {
    nombre: texto(datos.nombre),
    segmento: texto(datos.segmento),
    correo: texto(datos.correo).toLowerCase(),
    contacto: texto(datos.contacto) || null,
    nit: texto(datos.nit).toUpperCase() || null,
  };
  requerido(errores, 'nombre', limpio.nombre, 120, 'el nombre o razón social');
  if (!SEGMENTOS.includes(limpio.segmento)) errores.segmento = 'Elija si es minorista o mayorista.';
  if (!CORREO.test(limpio.correo) || limpio.correo.length > 120) errores.correo = 'Escriba el correo empresarial donde recibirá su número de caso.';
  if (limpio.contacto && limpio.contacto.length > 80) errores.contacto = 'Use como máximo 80 caracteres.';
  if (limpio.nit && !NIT.test(limpio.nit)) errores.nit = 'Escriba el NIT sin espacios, por ejemplo 1234567-8, o CF.';
  return { errores, limpio, valido: Object.keys(errores).length === 0 };
}

// Cotización (M03). El número llega como los 6 dígitos o completo (COT-004517).
const NUMERO_COTIZACION = /^COT-\d{6}$/;
function numeroCotizacion(valor) {
  const t = texto(String(valor ?? '')).toUpperCase().replace(/\s/g, '');
  if (/^\d{6}$/.test(t)) return `COT-${t}`;
  return t;
}

function validarCotizacion(datos = {}) {
  const errores = {};
  const monto = Number(String(datos.monto ?? '').replace(/[Q,\s]/g, ''));
  const limpio = {
    numero: numeroCotizacion(datos.numero),
    monto: Math.round(monto * 100) / 100,
    idVendedor: Number(datos.idVendedor),
    idCliente: Number(datos.idCliente),
    esPrueba: datos.esPrueba === true || datos.esPrueba === 'true' || datos.esPrueba === 'on',
  };
  if (!NUMERO_COTIZACION.test(limpio.numero)) errores.numero = 'Escriba los 6 dígitos del número de cotización, por ejemplo 004517.';
  if (!Number.isFinite(monto) || monto <= 0) errores.monto = 'Escriba el monto cotizado; debe ser mayor que cero.';
  else if (monto >= 1e10) errores.monto = 'El monto es demasiado grande.';
  if (!Number.isInteger(limpio.idVendedor) || limpio.idVendedor <= 0) errores.idVendedor = 'Elija el vendedor que atendió.';
  if (!Number.isInteger(limpio.idCliente) || limpio.idCliente <= 0) errores.idCliente = 'Elija la empresa cliente.';
  return { errores, limpio, valido: Object.keys(errores).length === 0 };
}

function validarMotivo(valor) {
  const motivo = texto(valor);
  if (motivo.length < 5) return { error: 'Explique el motivo de la anulación (al menos 5 caracteres).' };
  if (motivo.length > 200) return { error: 'Use como máximo 200 caracteres.' };
  return { motivo };
}

// Respuesta de la terminal (M04). La compra es sí o no; el motivo solo se pide si no compró;
// el comentario es opcional. La hora de captura la da la tableta (puede enviarse más tarde
// si se cortó el internet, RNF05); si falta o no es creíble se usa la del servidor.
const MAX_ATRASO_CAPTURA = 72 * 3600 * 1000;
function validarRespuesta(datos = {}, ahora = Date.now()) {
  const errores = {};
  const compro = datos.compro === true ? true : datos.compro === false ? false : null;
  const comentario = typeof datos.comentario === 'string' ? datos.comentario.trim().replace(/[ \t]+/g, ' ') : '';
  const captura = new Date(datos.capturadaEn ?? NaN).getTime();
  const limpio = {
    numero: numeroCotizacion(datos.numero),
    calificacion: Number(datos.calificacion),
    compro,
    idMotivo: compro === false ? Number(datos.idMotivo) : null,
    comentario: comentario || null,
    capturadaEn: new Date(Number.isFinite(captura) && captura <= ahora + 300000 && captura >= ahora - MAX_ATRASO_CAPTURA ? captura : ahora),
  };
  if (!NUMERO_COTIZACION.test(limpio.numero)) errores.numero = 'Número de cotización no válido.';
  if (!Number.isInteger(limpio.calificacion) || limpio.calificacion < 1 || limpio.calificacion > 5) errores.calificacion = 'Elija una calificación del 1 al 5.';
  if (compro === null) errores.compro = 'Indique si concretó la compra.';
  if (compro === false && (!Number.isInteger(limpio.idMotivo) || limpio.idMotivo <= 0)) errores.idMotivo = 'Elija el motivo.';
  if (comentario.length > 500) errores.comentario = 'Use como máximo 500 caracteres.';
  return { errores, limpio, valido: Object.keys(errores).length === 0 };
}

// Identificador numérico de la dirección (/api/usuarios/7).
function identificador(valor) {
  const n = Number(valor);
  return Number.isInteger(n) && n > 0 && n < 2 ** 31 ? n : null;
}

module.exports = { validarUsuario, validarCliente, validarCotizacion, validarMotivo, validarRespuesta, numeroCotizacion, identificador, PERFILES, SEGMENTOS };
