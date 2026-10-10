'use strict';

// Contraseñas: se guardan solo como resumen con valor aleatorio (RS02) usando scrypt,
// función incluida en Node.js y recomendada por OWASP para este fin.

const crypto = require('node:crypto');
const { promisify } = require('node:util');

const scrypt = promisify(crypto.scrypt);
const COSTO = 17; // 2^17, el mínimo que recomienda OWASP para scrypt
const BLOQUE = 8;
const PARALELO = 1;
const LARGO = 64;

function opciones(costo, bloque, paralelo) {
  const N = 2 ** costo;
  return { N, r: bloque, p: paralelo, maxmem: 256 * N * bloque };
}

async function generarResumen(clave) {
  const sal = crypto.randomBytes(16);
  const resumen = await scrypt(clave.normalize('NFKC'), sal, LARGO, opciones(COSTO, BLOQUE, PARALELO));
  return ['scrypt', COSTO, BLOQUE, PARALELO, sal.toString('base64'), resumen.toString('base64')].join('$');
}

async function verificar(clave, guardado) {
  const partes = String(guardado || '').split('$');
  if (partes.length !== 6 || partes[0] !== 'scrypt') return false;
  const [, costo, bloque, paralelo, salB64, resumenB64] = partes;
  const esperado = Buffer.from(resumenB64, 'base64');
  const obtenido = await scrypt(String(clave).normalize('NFKC'), Buffer.from(salB64, 'base64'), esperado.length,
    opciones(Number(costo), Number(bloque), Number(paralelo)));
  return esperado.length === obtenido.length && crypto.timingSafeEqual(esperado, obtenido);
}

// Requisitos mínimos de complejidad (RS03). Devuelve la lista de lo que falta.
function revisarPolitica(clave) {
  const faltas = [];
  const texto = String(clave || '');
  if (texto.length < 8) faltas.push('al menos 8 caracteres');
  if (!/[A-ZÁÉÍÓÚÑ]/.test(texto)) faltas.push('una letra mayúscula');
  if (!/[a-záéíóúñ]/.test(texto)) faltas.push('una letra minúscula');
  if (!/\d/.test(texto)) faltas.push('un número');
  return faltas;
}

module.exports = { generarResumen, verificar, revisarPolitica };
