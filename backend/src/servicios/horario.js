'use strict';

// Horario hábil de la sucursal: lunes a viernes de 8:00 a 17:00, hora de Guatemala.
// Los plazos de los casos (3 h y 48 h minorista; 30 min y 7 h mayorista) se cuentan
// solo dentro de ese horario. Guatemala no cambia de horario: siempre UTC-6.
// No contempla feriados: un feriado cuenta como día hábil.

const DESFASE = -6 * 3600000;
const INICIO = 8 * 60;  // minutos desde la medianoche
const FIN = 17 * 60;
const MIN = 60000;

const aLocal = (fecha) => new Date(new Date(fecha).getTime() + DESFASE);  // campos UTC = hora local
const aReal = (local) => new Date(local.getTime() - DESFASE);
const minutosDelDia = (l) => l.getUTCHours() * 60 + l.getUTCMinutes() + l.getUTCSeconds() / 60 + l.getUTCMilliseconds() / MIN;
const medianoche = (l) => Date.UTC(l.getUTCFullYear(), l.getUTCMonth(), l.getUTCDate());
const habil = (l) => l.getUTCDay() >= 1 && l.getUTCDay() <= 5;

// Lleva un instante local al siguiente momento hábil (o lo deja igual si ya lo es).
function aHabil(l) {
  for (;;) {
    const m = minutosDelDia(l);
    if (!habil(l) || m >= FIN) { l = new Date(medianoche(l) + 86400000 + INICIO * MIN); continue; }
    if (m < INICIO) l = new Date(medianoche(l) + INICIO * MIN);
    return l;
  }
}

// Fecha en que vence un plazo de "minutos" hábiles contado desde "desde".
function sumarMinutosHabiles(desde, minutos) {
  let l = aHabil(aLocal(desde));
  let restante = minutos;
  while (restante > 0) {
    const disponible = FIN - minutosDelDia(l);
    if (restante <= disponible) return aReal(new Date(l.getTime() + restante * MIN));
    restante -= disponible;
    l = aHabil(new Date(medianoche(l) + 86400000 + INICIO * MIN));
  }
  return aReal(l);
}

// Minutos hábiles transcurridos entre dos fechas (para medir el tiempo de atención).
function minutosHabilesEntre(desde, hasta) {
  let a = aHabil(aLocal(desde));
  const b = aLocal(hasta);
  let total = 0;
  while (a < b) {
    const finDia = new Date(medianoche(a) + FIN * MIN);
    const corte = b < finDia ? b : finDia;
    total += (corte - a) / MIN;
    if (corte === b) break;
    a = aHabil(new Date(medianoche(a) + 86400000 + INICIO * MIN));
  }
  return Math.max(0, Math.round(total));
}

module.exports = { sumarMinutosHabiles, minutosHabilesEntre };
