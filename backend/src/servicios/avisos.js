'use strict';

// Avisos de los casos (M05, RF11): correo por Resend y aviso dentro de la aplicación.
// Cada aviso queda registrado en la tabla notificacion con su estado de envío.

const config = require('../config');
const { consulta } = require('../bd');
const correo = require('./correo');
const casos = require('./casos');

const fechaHora = (f) => new Intl.DateTimeFormat('es-GT', { timeZone: 'America/Guatemala', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(f));
const moneda = (n) => new Intl.NumberFormat('es-GT', { style: 'currency', currency: 'GTQ' }).format(n);
const primerNombre = (n) => String(n || '').split(' ')[0];
const enlaceCasos = (id) => `${config.urlAplicacion}/casos.html${id ? `?caso=${id}` : ''}`;
const ESTRELLAS = { 1: 'Muy insatisfecho', 2: 'Insatisfecho', 3: 'Neutral', 4: 'Satisfecho', 5: 'Muy satisfecho' };
const plazoTexto = (min) => (min < 60 ? `${min} minutos hábiles` : `${min / 60} horas hábiles`);

// El aviso en la aplicación queda entregado al guardarlo; el correo, al confirmarlo Resend.
async function registrar({ idCaso, idUsuario = null, para = null, canal, tipo, estado = canal === 'aplicacion' ? 'enviada' : 'pendiente' }) {
  // Cada parámetro se usa una sola vez: PostgreSQL no admite que un mismo $n tome dos tipos.
  const { rows } = await consulta(`
    INSERT INTO notificacion (id_caso, id_usuario_destinatario, correo_destinatario, canal, tipo, estado_envio, fecha_hora_envio)
    VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id_notificacion AS id`,
  [idCaso, idUsuario, para, canal, tipo, estado, estado === 'enviada' ? new Date() : null]);
  return rows[0].id;
}

async function porCorreo({ idCaso, idUsuario = null, para, tipo, mensaje }) {
  const id = await registrar({ idCaso, idUsuario, para, canal: 'correo', tipo });
  const estado = await correo.enviar({ para, ...mensaje });
  if (estado !== 'pendiente') {
    await consulta('UPDATE notificacion SET estado_envio = $2, fecha_hora_envio = $3 WHERE id_notificacion = $1',
      [id, estado, estado === 'enviada' ? new Date() : null]);
  }
}

function filasCaso(c) {
  return [
    ['Caso', c.numero], ['Cotización', c.cotizacion], ['Cliente', `${c.cliente} (${c.codigoCliente}) · ${c.segmento === 'mayorista' ? 'Mayorista' : 'Minorista'}`],
    ['Monto cotizado', moneda(c.monto)], ['Calificación', `${c.calificacion} · ${ESTRELLAS[c.calificacion]}`],
    ['Compró', c.compro ? 'Sí' : `No${c.motivo ? ` · ${c.motivo}` : ''}`], ['Comentario', c.comentario || 'Sin comentario'],
    ['Vendedor', c.vendedor], ['Primer contacto antes de', fechaHora(c.venceContacto)],
  ];
}

// Caso nuevo: responsable y copia (correo y aplicación) y el cliente con su número de caso.
async function casoNuevo(idCaso) {
  const c = await casos.obtener(idCaso);
  if (!c) return;
  const internos = [[c.idResponsable, c.correoResponsable, c.responsable, 'caso_asignado'], [c.idCopia, c.correoCopia, c.copia, 'caso_copia']].filter(([id]) => id);
  for (const [id, para, nombre, tipo] of internos) {
    await registrar({ idCaso, idUsuario: id, canal: 'aplicacion', tipo });
    await porCorreo({
      idCaso, idUsuario: id, para, tipo,
      mensaje: {
        asunto: `${tipo === 'caso_asignado' ? 'Caso asignado' : 'Copia de caso'} ${c.numero}: ${c.cliente} calificó ${c.calificacion} de 5`,
        ...correo.plantilla({
          titulo: tipo === 'caso_asignado' ? `Se le asignó el caso ${c.numero}` : `Copia del caso ${c.numero}`,
          saludo: `Hola, ${primerNombre(nombre)}:`,
          parrafos: [tipo === 'caso_asignado'
            ? `Un cliente calificó la atención como insatisfactoria. Tiene ${plazoTexto(c.minutosContacto)} para el primer contacto.`
            : `Recibe esta copia para dar seguimiento. El responsable del caso es ${c.responsable}.`],
          filas: filasCaso(c),
          boton: { texto: 'Abrir el caso', url: enlaceCasos(c.id) },
        }),
      },
    });
  }
  if (c.correoCliente) {
    await porCorreo({
      idCaso, para: c.correoCliente, tipo: 'caso_cliente',
      mensaje: {
        asunto: `Tylsefa: registramos su caso ${c.numero}`,
        responderA: c.correoResponsable,
        ...correo.plantilla({
          titulo: `Su caso ${c.numero} quedó registrado`,
          saludo: c.contacto ? `Estimado(a) ${c.contacto}:` : 'Estimado cliente:',
          parrafos: [
            'Gracias por calificar nuestra atención. Lamentamos que su experiencia no haya sido buena.',
            `${c.segmento === 'mayorista' ? 'La gerencia' : 'Un supervisor'} le contactará en un plazo máximo de ${plazoTexto(c.minutosContacto)}. Puede responder a este correo si desea agregar algo.`,
          ],
          filas: [['Número de caso', c.numero], ['Cotización', c.cotizacion]],
        }),
      },
    });
  }
}

// Plazo de primer contacto vencido: gerencia y supervisor reciben el aviso.
async function casoEscalado(idCaso) {
  const c = await casos.obtener(idCaso);
  if (!c) return;
  const destinos = [[c.idResponsable, c.correoResponsable, c.responsable], [c.idCopia, c.correoCopia, c.copia]].filter(([id]) => id);
  for (const [id, para, nombre] of destinos) {
    await registrar({ idCaso, idUsuario: id, canal: 'aplicacion', tipo: 'caso_escalado' });
    await porCorreo({
      idCaso, idUsuario: id, para, tipo: 'caso_escalado',
      mensaje: {
        asunto: `Caso ${c.numero} escalado: venció el plazo de primer contacto`,
        ...correo.plantilla({
          titulo: `El caso ${c.numero} se escaló`,
          saludo: `Hola, ${primerNombre(nombre)}:`,
          parrafos: [`Venció el plazo de ${plazoTexto(c.minutosContacto)} para el primer contacto y nadie lo registró. Contacte al cliente lo antes posible.`],
          filas: filasCaso(c),
          boton: { texto: 'Abrir el caso', url: enlaceCasos(c.id) },
        }),
      },
    });
  }
}

// Avance del caso (primer contacto, actuación o cierre): avisa por correo y en la aplicación a
// los demás involucrados (responsable y copia), menos a quien lo registró. Así la gerencia, que
// cierra los casos mayoristas, se entera de lo que hace el supervisor sin entrar al sistema.
const QUE = { contacto: 'registró el primer contacto', actuacion: 'agregó una actuación', cierre: 'cerró el caso' };
async function casoActualizado(idCaso, idActor, accion, texto) {
  const c = await casos.obtener(idCaso);
  if (!c) return;
  const { rows: [actor] } = await consulta("SELECT nombres || ' ' || apellidos AS nombre FROM usuario WHERE id_usuario = $1", [idActor]);
  const destinos = [[c.idResponsable, c.correoResponsable, c.responsable], [c.idCopia, c.correoCopia, c.copia]]
    .filter(([id], i, todos) => id && id !== idActor && todos.findIndex(([otro]) => otro === id) === i);
  for (const [id, para, nombre] of destinos) {
    const tipo = accion === 'cierre' ? 'caso_cerrado_interno' : 'caso_actualizado';
    await registrar({ idCaso, idUsuario: id, canal: 'aplicacion', tipo });
    const puedeCerrar = c.segmento === 'mayorista' && accion !== 'cierre' && id === c.idResponsable;
    await porCorreo({
      idCaso, idUsuario: id, para, tipo,
      mensaje: {
        asunto: `${c.numero}: ${actor?.nombre || 'Se'} ${QUE[accion]}`,
        ...correo.plantilla({
          titulo: `Avance del caso ${c.numero}`,
          saludo: `Hola, ${primerNombre(nombre)}:`,
          parrafos: [
            `${actor?.nombre || 'Un usuario'} ${QUE[accion]}:`,
            texto,
            ...(puedeCerrar ? ['Este caso es de un cliente mayorista: el cierre lo autoriza la gerencia desde el sistema.'] : []),
          ],
          filas: [['Cliente', `${c.cliente} (${c.codigoCliente}) · ${c.segmento === 'mayorista' ? 'Mayorista' : 'Minorista'}`],
            ['Calificación', `${c.calificacion} · ${ESTRELLAS[c.calificacion]}`], ['Estado', { abierto: 'Sin contacto', en_seguimiento: 'En seguimiento', escalado: 'Escalado', cerrado: 'Cerrado' }[c.estado]]],
          boton: { texto: 'Abrir el caso', url: `${config.urlAplicacion}/casos.html?caso=${c.id}` },
        }),
      },
    });
  }
}

// Cierre: el cliente recibe la resolución (CU-06, paso 8).
async function casoCerrado(idCaso) {
  const c = await casos.obtener(idCaso);
  if (!c || !c.correoCliente) return;
  await porCorreo({
    idCaso, para: c.correoCliente, tipo: 'caso_cerrado',
    mensaje: {
      asunto: `Tylsefa: su caso ${c.numero} fue atendido`,
      responderA: c.correoResponsable,
      ...correo.plantilla({
        titulo: `Cerramos su caso ${c.numero}`,
        saludo: c.contacto ? `Estimado(a) ${c.contacto}:` : 'Estimado cliente:',
        parrafos: ['Gracias por darnos la oportunidad de mejorar. Este es el resumen de la atención a su caso:', c.resolucion],
        filas: [['Número de caso', c.numero], ['Cotización', c.cotizacion]],
      }),
    },
  });
}

// Copia del comentario al vendedor (retroalimentación). Si hay caso, queda registrada.
async function respuestaAlVendedor(idRespuesta, idCaso = null) {
  const { rows: [r] } = await consulta(`
    SELECT r.calificacion, r.concreto_compra AS compro, r.comentario, mo.descripcion AS motivo, c.numero_correlativo AS cotizacion,
           e.nombre AS cliente, v.id_usuario AS "idVendedor", v.nombres AS nombre, v.correo
      FROM encuesta_respuesta r JOIN cotizacion c ON c.id_cotizacion = r.id_cotizacion
      JOIN empresa_cliente e ON e.id_cliente = c.id_cliente JOIN usuario v ON v.id_usuario = c.id_vendedor
      LEFT JOIN motivo_no_compra mo ON mo.id_motivo = r.id_motivo
     WHERE r.id_respuesta = $1`, [idRespuesta]);
  if (!r || (!r.comentario && !idCaso)) return;
  const mensaje = {
    asunto: `Retroalimentación de ${r.cliente}: ${r.calificacion} de 5`,
    ...correo.plantilla({
      titulo: 'Tiene una nueva retroalimentación',
      saludo: `Hola, ${primerNombre(r.nombre)}:`,
      parrafos: ['Un cliente que usted atendió calificó la atención. Confirme que la leyó con el botón Enterado en la pantalla de Retroalimentación.'],
      filas: [['Cotización', r.cotizacion], ['Cliente', r.cliente], ['Calificación', `${r.calificacion} · ${ESTRELLAS[r.calificacion]}`],
        ['Compró', r.compro ? 'Sí' : `No${r.motivo ? ` · ${r.motivo}` : ''}`], ['Comentario', r.comentario || 'Sin comentario']],
      boton: { texto: 'Abrir Retroalimentación', url: `${config.urlAplicacion}/retroalimentacion.html` },
    }),
  };
  if (idCaso) {
    await registrar({ idCaso, idUsuario: r.idVendedor, canal: 'aplicacion', tipo: 'copia_vendedor' });
    await porCorreo({ idCaso, idUsuario: r.idVendedor, para: r.correo, tipo: 'copia_vendedor', mensaje });
  } else {
    await correo.enviar({ para: r.correo, ...mensaje });
  }
}

// Avisos sin leer del usuario y conteo de pendientes para el menú.
async function delUsuario(usuario) {
  const [avisos, pendientes, retro] = await Promise.all([
    consulta(`SELECT n.id_notificacion AS id, n.tipo, n.id_caso AS "idCaso", cs.numero_caso AS "numeroCaso", e.nombre AS cliente
                FROM notificacion n JOIN caso_servicio cs ON cs.id_caso = n.id_caso
                JOIN encuesta_respuesta r ON r.id_respuesta = cs.id_respuesta JOIN cotizacion c ON c.id_cotizacion = r.id_cotizacion
                JOIN empresa_cliente e ON e.id_cliente = c.id_cliente
               WHERE n.id_usuario_destinatario = $1 AND n.canal = 'aplicacion' AND NOT n.leida
               ORDER BY n.id_notificacion DESC LIMIT 20`, [usuario.id_usuario]),
    usuario.permisos.includes('caso.atender')
      ? consulta(`SELECT count(*)::int AS n FROM caso_servicio WHERE estado <> 'cerrado'
                   AND ($2 OR id_responsable = $1 OR id_usuario_copia = $1)`, [usuario.id_usuario, usuario.permisos.includes('caso.cerrar.mayorista')])
      : { rows: [{ n: 0 }] },
    usuario.permisos.includes('acuse.registrar')
      ? consulta(`SELECT count(*)::int AS n FROM encuesta_respuesta r JOIN cotizacion c ON c.id_cotizacion = r.id_cotizacion
                   LEFT JOIN acuse_retroalimentacion a ON a.id_respuesta = r.id_respuesta
                   WHERE c.id_vendedor = $1 AND a.id_acuse IS NULL`, [usuario.id_usuario])
      : { rows: [{ n: 0 }] },
  ]);
  return { avisos: avisos.rows, casosPendientes: pendientes.rows[0].n, retroalimentacionPendiente: retro.rows[0].n };
}

async function marcarLeidos(idCaso, idUsuario) {
  await consulta(`UPDATE notificacion SET leida = true, fecha_lectura = now()
                   WHERE id_caso = $1 AND id_usuario_destinatario = $2 AND canal = 'aplicacion' AND NOT leida`, [idCaso, idUsuario]);
}

// Se llama sin esperar: los correos no deben demorar la respuesta de la terminal (RNF02).
function enSegundoPlano(promesa) {
  promesa.catch((error) => console.error('Aviso no enviado:', error.message));
}

module.exports = { casoNuevo, casoEscalado, casoCerrado, casoActualizado, respuestaAlVendedor, delUsuario, marcarLeidos, enSegundoPlano };
