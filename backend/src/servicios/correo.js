'use strict';

// Envío de correos por Resend (M05, RF11). Cada aviso queda en la tabla notificacion con su
// estado: enviada, fallida o pendiente (sin llave de Resend o dirección de prueba).

const config = require('../config');

function omitido(direccion) {
  const dominio = String(direccion || '').toLowerCase().split('@')[1] || '';
  return !dominio || config.correo.dominiosOmitidos.includes(dominio);
}

// Devuelve 'enviada', 'fallida' o 'pendiente'. Nunca lanza error: un correo que no sale
// no debe impedir que se registre la respuesta ni el caso.
async function enviar({ para, asunto, html, texto }) {
  if (omitido(para) || !config.correo.llave) return 'pendiente';
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.correo.llave}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: config.correo.remitente, to: [para], subject: asunto, html, text: texto }),
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) {
      console.error('Resend rechazó el correo:', r.status, (await r.text()).slice(0, 200));
      return 'fallida';
    }
    return 'enviada';
  } catch (error) {
    console.error('No se pudo enviar el correo:', error.message);
    return 'fallida';
  }
}

// ---------- Plantilla ----------
const escapar = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// filas: [[etiqueta, valor], ...]; boton: { texto, url } opcional.
function plantilla({ titulo, saludo, parrafos = [], filas = [], boton, pie }) {
  const tabla = filas.length ? `
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin:20px 0;background:#f4f7fa;border-radius:12px">
      ${filas.map(([e, v]) => `<tr><td style="padding:10px 16px;color:#5c6a70;font-size:14px;width:40%;vertical-align:top">${escapar(e)}</td><td style="padding:10px 16px;color:#111111;font-size:14px;font-weight:600">${escapar(v)}</td></tr>`).join('')}
    </table>` : '';
  const accion = boton ? `<p style="margin:24px 0"><a href="${escapar(boton.url)}" style="display:inline-block;background:#0b78a8;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:999px">${escapar(boton.texto)}</a></p>` : '';
  const html = `<!doctype html><html lang="es"><body style="margin:0;background:#eef2f5;font-family:Inter,Segoe UI,Arial,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:28px 12px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden">
      <tr><td style="background:#0a0f14;padding:18px 28px;color:#ffffff;font-size:18px;font-weight:700;letter-spacing:0.08em">☥ TYLSEFA</td></tr>
      <tr><td style="padding:28px">
        <h1 style="margin:0 0 12px;font-size:22px;color:#111111">${escapar(titulo)}</h1>
        ${saludo ? `<p style="margin:0 0 12px;color:#111111;font-size:15px">${escapar(saludo)}</p>` : ''}
        ${parrafos.map((p) => `<p style="margin:0 0 12px;color:#333f44;font-size:15px;line-height:1.55">${escapar(p)}</p>`).join('')}
        ${tabla}${accion}
        <p style="margin:24px 0 0;color:#8494a3;font-size:12px">${escapar(pie || 'Droguería y Comercial Tylsefa · Sucursal Tulam Tzu, zona 4 de Mixco. Mensaje automático del sistema de satisfacción del cliente; por favor no lo responda.')}</p>
      </td></tr>
    </table>
  </td></tr></table></body></html>`;
  const texto = [titulo, saludo, ...parrafos, ...filas.map(([e, v]) => `${e}: ${v}`), boton ? `${boton.texto}: ${boton.url}` : ''].filter(Boolean).join('\n');
  return { html, texto };
}

module.exports = { enviar, plantilla, omitido };
