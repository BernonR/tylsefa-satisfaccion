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

## Módulos

| Módulo | Estado |
|---|---|
| M01 Acceso y seguridad | Inicio y cierre de sesión, menú según el perfil, cierre por inactividad, bitácora |
| M02 Catálogos | Usuarios (alta, edición, contraseña, desactivación), empresas cliente con código automático, personal en consulta, cambio de contraseña propio |
| M03 Cotizaciones | Registro por el supervisor (COT- y 6 dígitos, vigencia de 7 días), corrección mientras está pendiente, anulación con motivo, marca de prueba; el vendedor consulta solo las suyas |
| M04 Terminal de autoservicio | Pendiente |
| M05 Casos y notificaciones | Pendiente |
| M06 Indicadores y reportes | Pendiente |

## Importante

El archivo `backend/.env` guarda las contraseñas del sistema. No se comparte ni se sube a ningún sitio. Vea `backend/variables-de-entorno-ejemplo.txt`.
