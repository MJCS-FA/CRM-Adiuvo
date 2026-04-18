-- Home module reference queries (dbVisitasMedicas)

-- 1) Active cycle (latest active cycle by codPersonas)
SELECT
  CodigoCicloVisita,
  NombreCicloVisita,
  FechaInicio,
  FechaFin,
  CodigoUsuarioV
FROM dbVisitasMedicas.tblCicloVisita
WHERE IFNULL(IsActivo, 1) = 1
  AND CodigoUsuarioV = :codPersonas
ORDER BY CodigoCicloVisita DESC
LIMIT 1;

-- 2) Medical visits summary (CodigoEntidad = 1)
SELECT
  SUM(CASE WHEN CodigoEstado <> 4 AND CodigoEstado <> 3 THEN 1 ELSE 0 END) AS Agendados,
  SUM(CASE WHEN CodigoEstado = 5 THEN 1 ELSE 0 END) AS Completados
FROM dbVisitasMedicas.tblVisitaMedica vm
INNER JOIN dbVisitasMedicas.tblCicloVisita cv
  ON cv.CodigoCicloVisita = vm.CodigoCicloVisita
WHERE vm.CodigoUsuario = :codPersonas
  AND IFNULL(vm.IsActiva, 1) = 1
  AND vm.CodigoEntidad = 1;

-- 3) Branch visits summary (CodigoEntidad = 2)
SELECT
  SUM(CASE WHEN CodigoEstado <> 4 AND CodigoEstado <> 3 THEN 1 ELSE 0 END) AS Agendados,
  SUM(CASE WHEN CodigoEstado = 5 THEN 1 ELSE 0 END) AS Completados
FROM dbVisitasMedicas.tblVisitaMedica vm
INNER JOIN dbVisitasMedicas.tblCicloVisita cv
  ON cv.CodigoCicloVisita = vm.CodigoCicloVisita
WHERE vm.CodigoUsuario = :codPersonas
  AND IFNULL(vm.IsActiva, 1) = 1
  AND vm.CodigoEntidad = 2;

-- 4) Birthdays of assigned doctors for current month
SELECT DISTINCT
  m.CodigoMedico,
  COALESCE(
    NULLIF(m.NombrePersona, ''),
    TRIM(CONCAT_WS(' ', m.PrimerNombre, m.SegundoNombre, m.PrimerApellido, m.SegundoApellido))
  ) AS NombreMedico,
  m.FechaNacimiento
FROM dbVisitasMedicas.tblMedicosXVisitador mxv
INNER JOIN dbVisitasMedicas.tblMedico m
  ON m.CodigoMedico = mxv.CodigoMedico
  AND IFNULL(m.isActivo, 1) = 1
WHERE mxv.CodigoUsuario = :assignmentCode
  AND IFNULL(mxv.IsActivo, 1) = 1
  AND m.FechaNacimiento <> '1900-01-01'
  AND DATE_FORMAT(m.FechaNacimiento, '%m') = :monthNumber
ORDER BY DAY(m.FechaNacimiento), NombreMedico;
