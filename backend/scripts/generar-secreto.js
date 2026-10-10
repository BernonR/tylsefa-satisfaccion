'use strict';
// Genera un valor aleatorio para la variable SESION_SECRETO.
console.log(require('node:crypto').randomBytes(32).toString('hex'));
