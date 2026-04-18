-- Directory module reference queries (dbVisitasMedicas)

-- 1) Resolve visitador by codPersonas
SELECT
  CodigoVisitador,
  CodigoSAF,
  NombreCompleto
FROM dbVisitasMedicas.tblVisitador
WHERE CodigoSAF = :codPersonas
  AND IFNULL(IsActivo, 1) = 1
LIMIT 1;

-- 2) Assigned doctors count
SELECT COUNT(DISTINCT CodigoMedico) AS total
FROM dbVisitasMedicas.tblMedicosXVisitador
WHERE CodigoUsuario = :assignmentCode
  AND IFNULL(IsActivo, 1) = 1;

-- 3) Assigned branches count
SELECT COUNT(DISTINCT CodigoSucursal) AS total
FROM dbVisitasMedicas.tblSucursalesXVisitador
WHERE CodigoUsuarioVisitador = :assignmentCode
  AND IFNULL(IsActivo, 1) = 1;

-- 4) Hospitals catalog
SELECT CodigoHospitalClinica AS value, NombreHospitalClinica AS label
FROM dbVisitasMedicas.tblHospitalClinica
WHERE IFNULL(IsActivo, 1) = 1
ORDER BY NombreHospitalClinica;

-- 5) Specialties catalog
SELECT CodigoEspecialidad AS value, NombreEspecialidad AS label
FROM dbVisitasMedicas.tblEspecialidad
WHERE IFNULL(IsActivo, 1) = 1
ORDER BY NombreEspecialidad;

-- 6) Categories catalog
SELECT CodigoCategoriaMedico AS value, NombreCategoria AS label
FROM dbVisitasMedicas.tblCategoriaMedico
WHERE IFNULL(isActive, 1) = 1
ORDER BY NombreCategoria;

-- 7) Assigned doctors with filters (hospital/especialidad/categoria/nombre)
-- Implemented in backend/src/repositories/directoryRepository.js

-- 8) Assigned branches list
SELECT
  sxv.CodigoSucursalXVisitador,
  sxv.CodigoSucursal,
  sxv.CodigoInternoSucursal,
  sxv.Fecha,
  sxv.Hora,
  COALESCE(NULLIF(s.Nombre_Sucursal, ''), CONCAT('Sucursal ', sxv.CodigoSucursal)) AS nombreSucursal,
  NULLIF(s.DireccionSucursal, '') AS direccionSucursal,
  NULLIF(s.correoSucursal, '') AS correoSucursal
FROM dbVisitasMedicas.tblSucursalesXVisitador sxv
LEFT JOIN dbpqiygwlvvnhg.tblSucursales s
  ON s.Codigo_Sucursal = sxv.CodigoSucursal
WHERE sxv.CodigoUsuarioVisitador = :assignmentCode
  AND IFNULL(sxv.IsActivo, 1) = 1
  AND (s.Codigo_Sucursal IS NULL OR IFNULL(s.isActivo, 1) = 1)
  AND (:sucursal IS NULL OR sxv.CodigoSucursal = :sucursal)
ORDER BY nombreSucursal;
