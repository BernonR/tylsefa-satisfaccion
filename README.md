# Sistema Tylsefa

Sistema web para la medición de la satisfacción del cliente y la gestión de casos de servicio. Proyecto de graduación, Universidad Mariano Gálvez de Guatemala.

## Qué hay en cada carpeta

| Carpeta | Contenido |
|---|---|
| `frontend` | Las pantallas del sistema (HTML, CSS y JavaScript). En la publicación las sirve Vercel. |
| `backend` | El servidor en Node.js con Express. En la publicación lo atiende Render. |
| `base-de-datos` | El archivo que crea las tablas en PostgreSQL (Neon). |
| `pruebas` | Las pruebas automáticas con Playwright. |

## Comandos

| Comando | Para qué sirve |
|---|---|
| `npm run preparar` | Instala las librerías y el navegador de pruebas. Se corre una sola vez. |
| `npm run servidor` | Enciende el sistema en http://localhost:3000 |
| `npm run pruebas` | Corre las pruebas unitarias y las de interfaz. |
| `npm run reporte` | Abre el reporte de la última corrida de pruebas. |
| `npm run crear-admin --prefix backend` | Crea la cuenta del administrador en la base de desarrollo, o le cambia la contraseña. |
| `npm run generar-secreto --prefix backend` | Genera un valor para `SESION_SECRETO`. |
| `npm run cargar-datos-prueba --prefix backend` | Carga el personal y las empresas cliente de prueba (datos modificados de Tylsefa). |
| `npm run presentacion` | Corre las pruebas despacio y con el navegador visible. |
| `npm run presentacion -- -g "CP-E2E"` | Muestra solo el recorrido completo: cotización, encuesta, caso, cierre, retroalimentación y tablero. |

## Módulos

| Módulo | Estado |
|---|---|
| M01 Acceso y seguridad | Inicio y cierre de sesión, menú según el perfil, cierre por inactividad, bitácora |
| M02 Catálogos | Usuarios (alta, edición, contraseña, desactivación), empresas cliente con código automático, personal en consulta, cambio de contraseña propio |
| M03 Cotizaciones | Registro por el supervisor (COT- y 6 dígitos, vigencia de 7 días), corrección mientras está pendiente, anulación con motivo, marca de prueba; el vendedor consulta solo las suyas |
| M04 Terminal de autoservicio | Activación de la tableta por un supervisor o el administrador (90 días), número de cotización de un solo uso, calificación de 1 a 5, compra y motivo de no compra, comentario opcional, caso automático con calificación 1 o 2 según el segmento, regreso al inicio a los 60 segundos y envío diferido sin internet |
| M05 Casos y notificaciones | Bandeja de casos con plazos en horas hábiles, primer contacto, actuaciones, cierre por la gerencia en mayoristas, escalamiento automático al vencer el primer contacto, correos por Resend y avisos en la aplicación; retroalimentación del vendedor con Enterado y confirmación del coaching |
| M06 Indicadores y reportes | Tablero por perfil (vendedor, equipo del supervisor, sucursal) con periodo por mes o rango: satisfacción e insatisfacción ponderada por monto, comparación con el periodo anterior, tendencia, reparto de calificaciones, motivos de no compra, tasas de respuesta y de compra, casos en plazo, tiempo de primer contacto, ingreso expuesto, resultados por vendedor, satisfacción y compra por calificación, monto no vendido por motivo, minorista frente a mayorista, respuestas por día y hora, retroalimentación leída y coaching por vendedor, y voz del cliente; excluye los registros de prueba (la gerencia puede incluirlos para capacitación). La gerencia exporta el reporte completo en PDF y los listados en CSV (respuestas, resultados por vendedor, casos y motivos), con las empresas por código. El administrador depura los registros marcados como prueba desde Usuarios |

## Importante

El archivo `backend/.env` guarda las contraseñas del sistema. No se comparte ni se sube a ningún sitio. Vea `backend/variables-de-entorno-ejemplo.txt`.
