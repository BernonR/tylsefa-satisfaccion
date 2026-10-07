-- =====================================================================
-- Sistema web para la medicion de la satisfaccion del cliente y la
-- gestion de casos de servicio - Tylsefa, sucursal Tulam Tzu
-- Esquema de base de datos para PostgreSQL (Neon)
-- Ejecutar completo en el SQL Editor, una vez por cada rama.
-- =====================================================================

-- ---------- Control de acceso ----------
CREATE TABLE sucursal (
    id_sucursal   INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre        VARCHAR(80)  NOT NULL,
    direccion     VARCHAR(150) NOT NULL,
    zona          VARCHAR(20),
    activa        BOOLEAN      NOT NULL DEFAULT TRUE
);

CREATE TABLE perfil (
    id_perfil     INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre        VARCHAR(40)  NOT NULL UNIQUE,
    descripcion   VARCHAR(150)
);

CREATE TABLE permiso (
    id_permiso    INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    codigo        VARCHAR(40)  NOT NULL UNIQUE,
    descripcion   VARCHAR(150)
);

CREATE TABLE perfil_permiso (
    id_perfil     INTEGER NOT NULL REFERENCES perfil (id_perfil),
    id_permiso    INTEGER NOT NULL REFERENCES permiso (id_permiso),
    PRIMARY KEY (id_perfil, id_permiso)
);

CREATE TABLE usuario (
    id_usuario      INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombres         VARCHAR(60)  NOT NULL,
    apellidos       VARCHAR(60)  NOT NULL,
    correo          VARCHAR(120) NOT NULL UNIQUE,
    hash_contrasena VARCHAR(255) NOT NULL,
    id_perfil       INTEGER NOT NULL REFERENCES perfil (id_perfil),
    id_supervisor   INTEGER REFERENCES usuario (id_usuario),
    id_sucursal     INTEGER NOT NULL REFERENCES sucursal (id_sucursal),
    activo          BOOLEAN     NOT NULL DEFAULT TRUE,
    fecha_creacion  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- Operacion comercial ----------
CREATE TABLE empresa_cliente (
    id_cliente         INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    codigo             VARCHAR(12)  NOT NULL UNIQUE,
    nombre             VARCHAR(120) NOT NULL,
    nit                VARCHAR(20),
    segmento           VARCHAR(12)  NOT NULL CHECK (segmento IN ('minorista', 'mayorista')),
    correo_empresarial VARCHAR(120),
    contacto           VARCHAR(80),
    activo             BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE motivo_no_compra (
    id_motivo     INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    descripcion   VARCHAR(120) NOT NULL,
    activo        BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE cotizacion (
    id_cotizacion          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    numero_correlativo     VARCHAR(25) NOT NULL UNIQUE,
    id_vendedor            INTEGER NOT NULL REFERENCES usuario (id_usuario),
    id_cliente             INTEGER NOT NULL REFERENCES empresa_cliente (id_cliente),
    id_supervisor_registro INTEGER NOT NULL REFERENCES usuario (id_usuario),
    fecha_hora             TIMESTAMPTZ NOT NULL DEFAULT now(),
    estado                 VARCHAR(15) NOT NULL DEFAULT 'pendiente'
                           CHECK (estado IN ('pendiente', 'respondida', 'anulada')),
    motivo_anulacion       VARCHAR(200),
    es_prueba              BOOLEAN NOT NULL DEFAULT FALSE,
    -- separacion de funciones: quien atiende no registra su propia cotizacion
    CONSTRAINT ck_cotizacion_separacion CHECK (id_vendedor <> id_supervisor_registro)
);

CREATE TABLE encuesta_respuesta (
    id_respuesta        INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_cotizacion       INTEGER NOT NULL UNIQUE REFERENCES cotizacion (id_cotizacion),
    calificacion        SMALLINT NOT NULL CHECK (calificacion BETWEEN 1 AND 5),
    concreto_compra     BOOLEAN NOT NULL,
    id_motivo           INTEGER REFERENCES motivo_no_compra (id_motivo),
    comentario          TEXT,
    fecha_hora_captura  TIMESTAMPTZ NOT NULL,
    fecha_hora_registro TIMESTAMPTZ NOT NULL DEFAULT now(),
    es_prueba           BOOLEAN NOT NULL DEFAULT FALSE
);

-- ---------- Casos de servicio ----------
CREATE TABLE plazo_atencion (
    id_plazo                 INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    segmento                 VARCHAR(12) NOT NULL CHECK (segmento IN ('minorista', 'mayorista')),
    minutos_primer_contacto  INTEGER NOT NULL CHECK (minutos_primer_contacto > 0),
    horas_cierre             INTEGER NOT NULL CHECK (horas_cierre > 0),
    vigente                  BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE caso_servicio (
    id_caso                    INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    numero_caso                VARCHAR(20) NOT NULL UNIQUE,
    id_respuesta               INTEGER NOT NULL UNIQUE REFERENCES encuesta_respuesta (id_respuesta),
    id_responsable             INTEGER NOT NULL REFERENCES usuario (id_usuario),
    id_usuario_copia           INTEGER REFERENCES usuario (id_usuario),
    id_plazo                   INTEGER NOT NULL REFERENCES plazo_atencion (id_plazo),
    fecha_hora_creacion        TIMESTAMPTZ NOT NULL DEFAULT now(),
    fecha_hora_primer_contacto TIMESTAMPTZ,
    fecha_hora_escalamiento    TIMESTAMPTZ,
    fecha_hora_cierre          TIMESTAMPTZ,
    estado                     VARCHAR(15) NOT NULL DEFAULT 'abierto'
                               CHECK (estado IN ('abierto', 'en_seguimiento', 'escalado', 'cerrado')),
    resolucion                 TEXT,
    es_prueba                  BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE actuacion_caso (
    id_actuacion  INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_caso       INTEGER NOT NULL REFERENCES caso_servicio (id_caso),
    id_usuario    INTEGER NOT NULL REFERENCES usuario (id_usuario),
    fecha_hora    TIMESTAMPTZ NOT NULL DEFAULT now(),
    descripcion   TEXT NOT NULL
);

CREATE TABLE notificacion (
    id_notificacion         INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_caso                 INTEGER NOT NULL REFERENCES caso_servicio (id_caso),
    id_usuario_destinatario INTEGER REFERENCES usuario (id_usuario),
    correo_destinatario     VARCHAR(120),
    canal                   VARCHAR(12) NOT NULL CHECK (canal IN ('correo', 'aplicacion')),
    tipo                    VARCHAR(25) NOT NULL,
    fecha_hora_envio        TIMESTAMPTZ,
    estado_envio            VARCHAR(15) NOT NULL DEFAULT 'pendiente'
                            CHECK (estado_envio IN ('pendiente', 'enviada', 'fallida')),
    leida                   BOOLEAN NOT NULL DEFAULT FALSE,
    fecha_lectura           TIMESTAMPTZ
);

CREATE TABLE acuse_retroalimentacion (
    id_acuse         INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_respuesta     INTEGER NOT NULL UNIQUE REFERENCES encuesta_respuesta (id_respuesta),
    id_vendedor      INTEGER NOT NULL REFERENCES usuario (id_usuario),
    fecha_hora_acuse TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE bitacora_auditoria (
    id_registro          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_usuario           INTEGER REFERENCES usuario (id_usuario),
    accion               VARCHAR(40) NOT NULL,
    entidad              VARCHAR(40) NOT NULL,
    id_registro_afectado INTEGER,
    fecha_hora           TIMESTAMPTZ NOT NULL DEFAULT now(),
    detalle              TEXT
);

-- ---------- Indices de apoyo a las consultas del tablero ----------
CREATE INDEX ix_cotizacion_vendedor  ON cotizacion (id_vendedor);
CREATE INDEX ix_cotizacion_cliente   ON cotizacion (id_cliente);
CREATE INDEX ix_cotizacion_fecha     ON cotizacion (fecha_hora);
CREATE INDEX ix_caso_responsable     ON caso_servicio (id_responsable);
CREATE INDEX ix_caso_estado          ON caso_servicio (estado);
CREATE INDEX ix_actuacion_caso       ON actuacion_caso (id_caso);
CREATE INDEX ix_notificacion_destino ON notificacion (id_usuario_destinatario, leida);
CREATE INDEX ix_bitacora_fecha       ON bitacora_auditoria (fecha_hora);

-- =====================================================================
-- Datos iniciales
-- =====================================================================
INSERT INTO sucursal (nombre, direccion, zona)
VALUES ('Tulam Tzu', 'Zona 4 de Mixco, Guatemala', 'Zona 4');

INSERT INTO perfil (nombre, descripcion) VALUES
 ('vendedor',      'Atiende la interaccion comercial y consulta sus propios resultados'),
 ('supervisor',    'Registra cotizaciones y atiende casos de clientes minoristas'),
 ('gerente',       'Autoriza el cierre de casos mayoristas y consulta todos los indicadores'),
 ('administrador', 'Gestiona catalogos, usuarios y permisos');

INSERT INTO permiso (codigo, descripcion) VALUES
 ('catalogos.gestionar',   'Registrar, modificar y desactivar personal y clientes'),
 ('catalogos.consultar',   'Consultar los catalogos maestros'),
 ('usuarios.administrar',  'Crear cuentas y asignar perfiles'),
 ('cotizacion.registrar',  'Registrar y anular cotizaciones'),
 ('cotizacion.consultar',  'Consultar las cotizaciones registradas'),
 ('caso.atender',          'Registrar primer contacto y actuaciones'),
 ('caso.cerrar.minorista', 'Autorizar el cierre de casos de clientes minoristas'),
 ('caso.cerrar.mayorista', 'Autorizar el cierre de casos de clientes mayoristas'),
 ('acuse.registrar',       'Registrar el acuse de enterado de la retroalimentacion'),
 ('tablero.propio',        'Consultar indicadores de sus propias interacciones'),
 ('tablero.equipo',        'Consultar indicadores de los vendedores a su cargo'),
 ('tablero.sucursal',      'Consultar indicadores de toda la sucursal'),
 ('reporte.exportar',      'Exportar el reporte consolidado del periodo');

INSERT INTO perfil_permiso (id_perfil, id_permiso)
SELECT p.id_perfil, m.id_permiso
FROM perfil p
JOIN permiso m ON
   (p.nombre = 'vendedor'      AND m.codigo IN ('cotizacion.consultar', 'acuse.registrar', 'tablero.propio'))
OR (p.nombre = 'supervisor'    AND m.codigo IN ('catalogos.consultar', 'cotizacion.registrar', 'cotizacion.consultar',
                                                 'caso.atender', 'caso.cerrar.minorista', 'tablero.equipo'))
OR (p.nombre = 'gerente'       AND m.codigo IN ('catalogos.consultar', 'cotizacion.consultar', 'caso.atender',
                                                 'caso.cerrar.minorista', 'caso.cerrar.mayorista',
                                                 'tablero.sucursal', 'reporte.exportar'))
OR (p.nombre = 'administrador' AND m.codigo IN ('catalogos.gestionar', 'catalogos.consultar', 'usuarios.administrar'));

-- Plazos comprometidos por Tylsefa (horas habiles, lunes a viernes de 8:00 a 17:00)
INSERT INTO plazo_atencion (segmento, minutos_primer_contacto, horas_cierre) VALUES
 ('minorista', 180, 48),
 ('mayorista',  30,  7);

-- Motivos de no concrecion: lista propuesta, pendiente de validar con la gerencia
INSERT INTO motivo_no_compra (descripcion) VALUES
 ('El precio no se ajusto a lo esperado'),
 ('El producto no estaba disponible'),
 ('Las condiciones de pago no fueron convenientes'),
 ('El tiempo de entrega no fue conveniente'),
 ('Solo se solicito la cotizacion para comparar'),
 ('Otro motivo');
