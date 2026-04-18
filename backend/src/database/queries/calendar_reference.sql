-- Calendar module reference queries (dbVisitasMedicas)

-- 1) Resolve visitador using codPersonas (CodigoSAF)
SELECT
  CodigoVisitador,
  CodigoSAF,
  CodigoPais,
  NombreCompleto
FROM dbVisitasMedicas.tblVisitador
WHERE CodigoSAF = :codPersonas
  AND IFNULL(IsActivo, 1) = 1
LIMIT 1;

-- 2) Visit type catalog
SELECT
  CodigoEntidad AS value,
  NombreEntidad AS label
FROM dbVisitasMedicas.tblTipoVisita
WHERE IFNULL(IsActivo, 1) = 1
ORDER BY Orden, NombreEntidad;

-- 3) Visit channel catalog
SELECT
  CodigoTipoCanal AS value,
  TipoCanal AS label
FROM dbVisitasMedicas.tblTipoCanal
WHERE IFNULL(IsActivo, 1) = 1
ORDER BY TipoCanal;

-- 4) Month visits by CodigoVisitador
SELECT
  CodigoVisitaMedica,
  CodigoVisitador,
  CodigoMedico,
  CodigoEntidad,
  CodigoTipoCanal,
  CodigoEstado,
  FechaProgramada,
  HoraProgramada
FROM dbVisitasMedicas.tblVisitaMedica
WHERE CodigoVisitador = :codigoVisitador
  AND IFNULL(IsActiva, 1) = 1
  AND FechaProgramada BETWEEN :startDate AND :endDate
ORDER BY FechaProgramada, HoraProgramada;

-- 5) Insert scheduled visit
INSERT INTO dbVisitasMedicas.tblVisitaMedica
(
  CodigoPais,
  CodigoEntidad,
  IsMedico,
  CodigoMedico,
  CodigoSucursal,
  CodigoLocal,
  CodigoCicloVisita,
  Fecha,
  Hora,
  CodigoUsuario,
  FechaProgramada,
  HoraProgramada,
  CodigoEstado,
  CodigoVisitador,
  CodigoTipoCanal,
  NombreVisita,
  Comentarios,
  IsActiva,
  IsProgramada
)
VALUES
(
  :codigoPais,
  :codigoEntidad,
  1,
  :codigoMedico,
  0,
  0,
  NULL,
  :fechaActual,
  :horaActual,
  :codigoUsuario,
  :fechaProgramada,
  :horaProgramada,
  :codigoEstado,
  :codigoVisitador,
  :codigoTipoCanal,
  '',
  :comentarios,
  1,
  1
);
