const { appConfig } = require('../config/app');
const { getPool } = require('../config/database');
const { AppError } = require('../utils/appError');

const tableColumnsCache = new Map();
const tableColumnsMetaCache = new Map();

function quoteIdentifier(value, label) {
  if (!/^[A-Za-z0-9_]+$/.test(value || '')) {
    throw new AppError(`Invalid identifier for ${label}.`, 500);
  }

  return `\`${value}\``;
}

const directoryConfig = appConfig.directory;
const dbName = quoteIdentifier(directoryConfig.dbName, 'DIRECTORY_DB_NAME');
const sucursalCatalogDbName = quoteIdentifier(
  directoryConfig.sucursalCatalogDbName,
  'DIRECTORY_SUCURSAL_CATALOG_DB_NAME'
);

const tables = {
  visitador: `${dbName}.${quoteIdentifier(
    directoryConfig.visitadorTable,
    'DIRECTORY_VISITADOR_TABLE'
  )}`,
  medicosXVisitador: `${dbName}.${quoteIdentifier(
    directoryConfig.medicosXVisitadorTable,
    'DIRECTORY_MEDICOS_X_VISITADOR_TABLE'
  )}`,
  sucursalesXVisitador: `${dbName}.${quoteIdentifier(
    directoryConfig.sucursalesXVisitadorTable,
    'DIRECTORY_SUCURSALES_X_VISITADOR_TABLE'
  )}`,
  medico: `${dbName}.${quoteIdentifier(
    directoryConfig.medicoTable,
    'DIRECTORY_MEDICO_TABLE'
  )}`,
  plazaMedica: `${dbName}.${quoteIdentifier(
    directoryConfig.plazaMedicaTable,
    'DIRECTORY_PLAZA_MEDICA_TABLE'
  )}`,
  hospital: `${dbName}.${quoteIdentifier(
    directoryConfig.hospitalTable,
    'DIRECTORY_HOSPITAL_CLINICA_TABLE'
  )}`,
  especialidad: `${dbName}.${quoteIdentifier(
    directoryConfig.especialidadTable,
    'DIRECTORY_ESPECIALIDAD_TABLE'
  )}`,
  especialidadesXMedico: `${dbName}.${quoteIdentifier(
    directoryConfig.especialidadesXMedicoTable,
    'DIRECTORY_ESPECIALIDADES_X_MEDICO_TABLE'
  )}`,
  especialidadesByMedico: `${dbName}.${quoteIdentifier(
    directoryConfig.especialidadesByMedicoTable,
    'DIRECTORY_ESPECIALIDADES_BY_MEDICO_TABLE'
  )}`,
  categoria: `${dbName}.${quoteIdentifier(
    directoryConfig.categoriaTable,
    'DIRECTORY_CATEGORIA_MEDICO_TABLE'
  )}`,
  geoDivisionL1: `${dbName}.${quoteIdentifier(
    directoryConfig.geoDivisionL1Table,
    'DIRECTORY_GEO_DIVISION_L1_TABLE'
  )}`,
  geoDivisionL2: `${dbName}.${quoteIdentifier(
    directoryConfig.geoDivisionL2Table,
    'DIRECTORY_GEO_DIVISION_L2_TABLE'
  )}`,
  rangoPrecioConsulta: `${dbName}.${quoteIdentifier(
    directoryConfig.rangoPrecioConsultaTable,
    'DIRECTORY_RANGO_PRECIO_CONSULTA_TABLE'
  )}`,
  lineasProductoXMedico: `${dbName}.${quoteIdentifier(
    directoryConfig.lineasProductoXMedicoTable,
    'DIRECTORY_LINEAS_PRODUCTO_X_MEDICO_TABLE'
  )}`,
  lineaProducto: `${dbName}.${quoteIdentifier(
    directoryConfig.lineaProductoTable,
    'DIRECTORY_LINEA_PRODUCTO_TABLE'
  )}`,
  sucursalCatalog: `${sucursalCatalogDbName}.${quoteIdentifier(
    directoryConfig.sucursalCatalogTable,
    'DIRECTORY_SUCURSAL_CATALOG_TABLE'
  )}`,
  sucursalInfoView: `${sucursalCatalogDbName}.${quoteIdentifier(
    directoryConfig.sucursalInfoViewTable,
    'DIRECTORY_SUCURSAL_INFO_VIEW_TABLE'
  )}`,
  personasGA: `${sucursalCatalogDbName}.${quoteIdentifier(
    directoryConfig.personasGATable,
    'DIRECTORY_PERSONAS_GA_TABLE'
  )}`,
  personasGF: `${sucursalCatalogDbName}.${quoteIdentifier(
    directoryConfig.personasGFTable,
    'DIRECTORY_PERSONAS_GF_TABLE'
  )}`,
  personasGO: `${sucursalCatalogDbName}.${quoteIdentifier(
    directoryConfig.personasGOTable,
    'DIRECTORY_PERSONAS_GO_TABLE'
  )}`,
  personasFallback: `${sucursalCatalogDbName}.${quoteIdentifier(
    appConfig.personasAuth.tableName,
    'PERSONAS_TABLE'
  )}`,
  visitaMedica: `${dbName}.${quoteIdentifier(
    appConfig.calendar?.visitaMedicaTable || 'tblVisitaMedica',
    'DIRECTORY_VISITA_MEDICA_TABLE'
  )}`,
  visitaMedicaLocal: `${dbName}.${quoteIdentifier(
    'LocaltblVisitaMedica',
    'DIRECTORY_LOCAL_VISITA_MEDICA_TABLE'
  )}`,
  medicoLocal: `${dbName}.${quoteIdentifier(
    'LocaltblMedico',
    'DIRECTORY_LOCAL_MEDICO_TABLE'
  )}`,
  estado: `${dbName}.${quoteIdentifier(
    appConfig.calendar?.estadoTable || 'tblEstado',
    'DIRECTORY_ESTADO_TABLE'
  )}`
};

const sucursalCatalogColumns = {
  id: quoteIdentifier(
    directoryConfig.sucursalCatalogIdColumn,
    'DIRECTORY_SUCURSAL_CATALOG_ID_COLUMN'
  ),
  name: quoteIdentifier(
    directoryConfig.sucursalCatalogNameColumn,
    'DIRECTORY_SUCURSAL_CATALOG_NAME_COLUMN'
  ),
  code: quoteIdentifier(
    directoryConfig.sucursalCatalogCodeColumn,
    'DIRECTORY_SUCURSAL_CATALOG_CODE_COLUMN'
  ),
  address: quoteIdentifier(
    directoryConfig.sucursalCatalogAddressColumn,
    'DIRECTORY_SUCURSAL_CATALOG_ADDRESS_COLUMN'
  ),
  email: quoteIdentifier(
    directoryConfig.sucursalCatalogEmailColumn,
    'DIRECTORY_SUCURSAL_CATALOG_EMAIL_COLUMN'
  ),
  isActive: quoteIdentifier(
    directoryConfig.sucursalCatalogActiveColumn,
    'DIRECTORY_SUCURSAL_CATALOG_ACTIVE_COLUMN'
  )
};

function resolveExecutor(executor) {
  return executor || getPool();
}

function escapeIdentifier(value) {
  return quoteIdentifier(value, `DIRECTORY_COLUMN_${value}`);
}

function normalizeKey(value) {
  return String(value || '').trim().toLowerCase();
}

function getRowValue(row, candidates = []) {
  if (!row || !candidates.length) {
    return null;
  }

  for (const candidate of candidates) {
    const key = Object.keys(row).find(
      (item) => normalizeKey(item) === normalizeKey(candidate)
    );

    if (key && row[key] !== undefined) {
      return row[key];
    }
  }

  return null;
}

function pickColumn(columns, candidates = []) {
  const normalizedColumns = new Map();

  for (const column of columns || []) {
    normalizedColumns.set(normalizeKey(column), column);
  }

  for (const candidate of candidates) {
    const found = normalizedColumns.get(normalizeKey(candidate));

    if (found) {
      return found;
    }
  }

  return null;
}

function asNumber(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function asBoolean(value) {
  if (value === null || value === undefined) {
    return false;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();

    if (['1', 'true', 'si', 'yes', 'y'].includes(normalized)) {
      return true;
    }

    if (['0', 'false', 'no', 'n'].includes(normalized)) {
      return false;
    }
  }

  return Boolean(Number(value));
}

function asString(value) {
  return value === null || value === undefined ? '' : String(value).trim();
}

function normalizeDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  const text = asString(value);

  if (!text) {
    return null;
  }

  const directMatch = text.match(/\d{4}-\d{2}-\d{2}/);

  if (directMatch) {
    return directMatch[0];
  }

  const parsed = new Date(text);

  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }

  return null;
}

function selectColumnOrNull(alias, column, outputAlias) {
  if (column) {
    return `${alias}.${escapeIdentifier(column)} AS ${escapeIdentifier(outputAlias)}`;
  }

  return `NULL AS ${escapeIdentifier(outputAlias)}`;
}

function normalizeOptionalText(value) {
  const text = asString(value);
  return text || null;
}

function sanitizeRecord(record = {}, excludedKeys = []) {
  const excluded = new Set(
    (excludedKeys || []).map((key) => normalizeKey(key))
  );
  const output = {};

  for (const [key, value] of Object.entries(record || {})) {
    if (excluded.has(normalizeKey(key))) {
      continue;
    }

    if (value === null || value === undefined || value === '') {
      continue;
    }

    output[key] = value;
  }

  return output;
}

function getCurrentDateTime() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, '0');

  return {
    fecha: `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())}`,
    hora: `${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())}:${pad(now.getUTCSeconds())}`
  };
}

function buildDoctorNameExpression(alias, availableColumns) {
  const fullNameColumn = pickColumn(availableColumns, [
    'NombrePersona',
    'Nombre_Personas',
    'NombreCompleto',
    'Nombre'
  ]);
  const firstNameColumn = pickColumn(availableColumns, ['PrimerNombre', 'Primer_Nombre']);
  const secondNameColumn = pickColumn(availableColumns, ['SegundoNombre', 'Segundo_Nombre']);
  const firstLastNameColumn = pickColumn(availableColumns, [
    'PrimerApellido',
    'Primer_Apellido'
  ]);
  const secondLastNameColumn = pickColumn(availableColumns, [
    'SegundoApellido',
    'Segundo_Apellido'
  ]);

  const expressions = [];

  if (fullNameColumn) {
    expressions.push(`NULLIF(${alias}.${escapeIdentifier(fullNameColumn)}, '')`);
  }

  const nameParts = [
    firstNameColumn,
    secondNameColumn,
    firstLastNameColumn,
    secondLastNameColumn
  ]
    .filter(Boolean)
    .map((column) => `${alias}.${escapeIdentifier(column)}`);

  if (nameParts.length) {
    expressions.push(`TRIM(CONCAT_WS(' ', ${nameParts.join(', ')}))`);
  }

  return expressions.length ? `COALESCE(${expressions.join(', ')})` : 'NULL';
}

async function resolveDoctorHistorySources(executor) {
  const [localVisitColumns, localMedicoColumns] = await Promise.all([
    getTableColumns('visitaMedicaLocal', executor),
    getTableColumns('medicoLocal', executor)
  ]);

  if (localVisitColumns.size && localMedicoColumns.size) {
    return {
      visitTableKey: 'visitaMedicaLocal',
      medicoTableKey: 'medicoLocal',
      visitColumns: localVisitColumns,
      medicoColumns: localMedicoColumns
    };
  }

  const [visitColumns, medicoColumns] = await Promise.all([
    getTableColumns('visitaMedica', executor),
    getTableColumns('medico', executor)
  ]);

  return {
    visitTableKey: 'visitaMedica',
    medicoTableKey: 'medico',
    visitColumns,
    medicoColumns
  };
}

async function getTableColumns(tableKey, executor) {
  const cacheKey = String(tableKey || '');

  if (tableColumnsCache.has(cacheKey)) {
    return tableColumnsCache.get(cacheKey);
  }

  const tableSql = tables[cacheKey];

  if (!tableSql) {
    return new Set();
  }

  let rows;

  try {
    [rows] = await resolveExecutor(executor).execute(`SHOW COLUMNS FROM ${tableSql}`);
  } catch (error) {
    const code = String(error?.code || '');

    if (code === 'ER_NO_SUCH_TABLE' || code === 'ER_BAD_DB_ERROR') {
      const empty = new Set();
      tableColumnsCache.set(cacheKey, empty);
      return empty;
    }

    throw error;
  }

  const values = new Set(
    (rows || [])
      .map((row) => asString(row.Field))
      .filter(Boolean)
  );

  tableColumnsCache.set(cacheKey, values);
  return values;
}

async function getTableColumnsMeta(tableKey, executor) {
  const cacheKey = String(tableKey || '');

  if (tableColumnsMetaCache.has(cacheKey)) {
    return tableColumnsMetaCache.get(cacheKey);
  }

  const tableSql = tables[cacheKey];

  if (!tableSql) {
    return [];
  }

  let rows;

  try {
    [rows] = await resolveExecutor(executor).execute(`SHOW COLUMNS FROM ${tableSql}`);
  } catch (error) {
    const code = String(error?.code || '');

    if (code === 'ER_NO_SUCH_TABLE' || code === 'ER_BAD_DB_ERROR') {
      const empty = [];
      tableColumnsMetaCache.set(cacheKey, empty);
      return empty;
    }

    throw error;
  }

  const values = (rows || []).map((row) => {
    const name = asString(row.Field);
    const nullable = String(row.Null || '').toUpperCase() === 'YES';
    const hasDefault = row.Default !== null && row.Default !== undefined;
    const autoIncrement = String(row.Extra || '')
      .toLowerCase()
      .includes('auto_increment');

    return {
      name,
      nullable,
      hasDefault,
      autoIncrement
    };
  });

  tableColumnsMetaCache.set(cacheKey, values);
  return values;
}

async function listCatalogFromTable({
  tableKey,
  valueCandidates,
  labelCandidates,
  parentCandidates = []
}) {
  const columns = await getTableColumns(tableKey);
  const activeColumn = pickColumn(columns, [
    'IsActivo',
    'IsActiva',
    'isActive',
    'Activo'
  ]);

  const params = [];
  let sql = `SELECT * FROM ${tables[tableKey]}`;

  if (activeColumn) {
    sql += ` WHERE IFNULL(${escapeIdentifier(activeColumn)}, 1) = ?`;
    params.push(1);
  }

  const [rows] = await getPool().execute(sql, params);

  const items = [];

  for (const row of rows || []) {
    const value = asNumber(getRowValue(row, valueCandidates));
    const label = asString(getRowValue(row, labelCandidates));

    if (!Number.isFinite(value) || !label) {
      continue;
    }

    const item = { value, label };
    const parentValue = asNumber(getRowValue(row, parentCandidates));

    if (Number.isFinite(parentValue)) {
      item.parentValue = parentValue;
    }

    items.push(item);
  }

  items.sort((a, b) => a.label.localeCompare(b.label, 'es'));

  return items;
}

async function findVisitadorByCodPersonas(codPersonas) {
  const [rows] = await getPool().execute(
    `SELECT
      CodigoVisitador AS codigoVisitador,
      CodigoSAF AS codigoSAF,
      CodigoPais AS codigoPais,
      NombreCompleto AS nombreCompleto
    FROM ${tables.visitador}
    WHERE CodigoSAF = ?
      AND IFNULL(IsActivo, 1) = 1
    LIMIT 1`,
    [codPersonas]
  );

  return rows[0] || null;
}

async function findVisitadorByCodigoVisitador(codigoVisitador) {
  const [rows] = await getPool().execute(
    `SELECT
      CodigoVisitador AS codigoVisitador,
      CodigoSAF AS codigoSAF,
      CodigoPais AS codigoPais,
      NombreCompleto AS nombreCompleto
    FROM ${tables.visitador}
    WHERE CodigoVisitador = ?
      AND IFNULL(IsActivo, 1) = 1
    LIMIT 1`,
    [codigoVisitador]
  );

  return rows[0] || null;
}

async function countAssignedDoctors(assignmentCode) {
  const [rows] = await getPool().execute(
    `SELECT COUNT(DISTINCT CodigoMedico) AS total
    FROM ${tables.medicosXVisitador}
    WHERE CodigoUsuario = ?
      AND IFNULL(IsActivo, 1) = 1`,
    [assignmentCode]
  );

  return Number(rows[0]?.total || 0);
}

async function countAssignedBranches(assignmentCode) {
  const [rows] = await getPool().execute(
    `SELECT COUNT(DISTINCT CodigoSucursal) AS total
    FROM ${tables.sucursalesXVisitador}
    WHERE CodigoUsuarioVisitador = ?
      AND IFNULL(IsActivo, 1) = 1`,
    [assignmentCode]
  );

  return Number(rows[0]?.total || 0);
}

async function listHospitals() {
  const [rows] = await getPool().execute(
    `SELECT
      CodigoHospitalClinica AS value,
      NombreHospitalClinica AS label
    FROM ${tables.hospital}
    WHERE IFNULL(IsActivo, 1) = 1
    ORDER BY NombreHospitalClinica`
  );

  return rows;
}

async function listSpecialties() {
  const [rows] = await getPool().execute(
    `SELECT
      CodigoEspecialidad AS value,
      NombreEspecialidad AS label
    FROM ${tables.especialidad}
    WHERE IFNULL(IsActivo, 1) = 1
    ORDER BY NombreEspecialidad`
  );

  return rows;
}

async function listCategories() {
  const [rows] = await getPool().execute(
    `SELECT
      CodigoCategoriaMedico AS value,
      NombreCategoria AS label
    FROM ${tables.categoria}
    WHERE IFNULL(isActive, 1) = 1
    ORDER BY NombreCategoria`
  );

  return rows;
}

async function listAssignedBranchCatalog(assignmentCode) {
  const [rows] = await getPool().execute(
    `SELECT DISTINCT
      sxv.CodigoSucursal AS value,
      COALESCE(
        NULLIF(sxv.CodigoInternoSucursal, ''),
        NULLIF(sc.${sucursalCatalogColumns.code}, ''),
        ''
      ) AS codigoInternoSucursal,
      COALESCE(
        NULLIF(sc.${sucursalCatalogColumns.name}, ''),
        CONCAT('Sucursal ', sxv.CodigoSucursal)
      ) AS nombreSucursal,
      COALESCE(
        NULLIF(
          CONCAT(
            COALESCE(NULLIF(sxv.CodigoInternoSucursal, ''), NULLIF(sc.${sucursalCatalogColumns.code}, '')),
            ' - ',
            COALESCE(
              NULLIF(sc.${sucursalCatalogColumns.name}, ''),
              CONCAT('Sucursal ', sxv.CodigoSucursal)
            )
          ),
          ' - '
        ),
        COALESCE(
          NULLIF(sc.${sucursalCatalogColumns.name}, ''),
          CONCAT('Sucursal ', sxv.CodigoSucursal)
        )
      ) AS label
    FROM ${tables.sucursalesXVisitador} sxv
    LEFT JOIN ${tables.sucursalCatalog} sc
      ON sc.${sucursalCatalogColumns.id} = sxv.CodigoSucursal
    WHERE sxv.CodigoUsuarioVisitador = ?
      AND IFNULL(sxv.IsActivo, 1) = 1
      AND (
        sc.${sucursalCatalogColumns.id} IS NULL
        OR IFNULL(sc.${sucursalCatalogColumns.isActive}, 1) = 1
      )
    ORDER BY label ASC`,
    [assignmentCode]
  );

  return rows;
}

async function listAssignedDoctors(assignmentCode, filters = {}) {
  const params = [assignmentCode];

  let sql = `SELECT DISTINCT
      m.CodigoMedico AS codigoMedico,
      COALESCE(
        NULLIF(m.NombrePersona, ''),
        TRIM(CONCAT_WS(' ', m.PrimerNombre, m.SegundoNombre, m.PrimerApellido, m.SegundoApellido))
      ) AS nombreMedico,
      m.CorreoElectronico AS correoElectronico,
      COALESCE(NULLIF(m.TelefonoMovil, ''), m.TelefonoClinica) AS telefono,
      cat.CodigoCategoriaMedico AS codigoCategoria,
      cat.NombreCategoria AS categoria,
      esp.CodigoEspecialidad AS codigoEspecialidad,
      esp.NombreEspecialidad AS especialidad,
      hosp.CodigoHospitalClinica AS codigoHospital,
      hosp.NombreHospitalClinica AS hospital,
      hosp.Direccion AS direccionHospital
    FROM ${tables.medicosXVisitador} mxv
    INNER JOIN ${tables.medico} m
      ON m.CodigoMedico = mxv.CodigoMedico
      AND IFNULL(m.isActivo, 1) = 1
    LEFT JOIN (
      SELECT
        ex.CodigoMedico,
        SUBSTRING_INDEX(
          GROUP_CONCAT(
            ex.CodigoEspecialidad
            ORDER BY IFNULL(ex.IsPrincipal, 0) DESC, ex.CodigoEspecialidad ASC
          ),
          ',',
          1
        ) AS CodigoEspecialidadPrincipal
      FROM ${tables.especialidadesXMedico} ex
      WHERE IFNULL(ex.IsActiva, 1) = 1
      GROUP BY ex.CodigoMedico
    ) exm ON exm.CodigoMedico = m.CodigoMedico
    LEFT JOIN ${tables.especialidad} esp
      ON esp.CodigoEspecialidad = exm.CodigoEspecialidadPrincipal
      AND IFNULL(esp.IsActivo, 1) = 1
    LEFT JOIN ${tables.categoria} cat
      ON cat.CodigoCategoriaMedico = m.CodigoCategoria
      AND IFNULL(cat.isActive, 1) = 1
    LEFT JOIN (
      SELECT
        p.CodigoMedico,
        SUBSTRING_INDEX(
          GROUP_CONCAT(
            p.CodigoHospitalClinica
            ORDER BY IFNULL(p.IsPrincipal, 0) DESC, p.CodigoHospitalClinica ASC
          ),
          ',',
          1
        ) AS CodigoHospitalPrincipal
      FROM ${tables.plazaMedica} p
      WHERE IFNULL(p.IsActivo, 1) = 1
      GROUP BY p.CodigoMedico
    ) pm ON pm.CodigoMedico = m.CodigoMedico
    LEFT JOIN ${tables.hospital} hosp
      ON hosp.CodigoHospitalClinica = pm.CodigoHospitalPrincipal
      AND IFNULL(hosp.IsActivo, 1) = 1
    WHERE mxv.CodigoUsuario = ?
      AND IFNULL(mxv.IsActivo, 1) = 1`;

  if (filters.hospital) {
    sql += ' AND hosp.CodigoHospitalClinica = ?';
    params.push(Number(filters.hospital));
  }

  if (filters.especialidad) {
    sql += ' AND esp.CodigoEspecialidad = ?';
    params.push(Number(filters.especialidad));
  }

  if (filters.categoria) {
    sql += ' AND cat.CodigoCategoriaMedico = ?';
    params.push(Number(filters.categoria));
  }

  if (filters.departamento) {
    sql += ' AND m.CodigoGeoDivisionL1 = ?';
    params.push(Number(filters.departamento));
  }

  if (filters.municipio) {
    sql += ' AND m.CodigoGeoDivisionL2 = ?';
    params.push(Number(filters.municipio));
  }

  if (filters.nombre) {
    sql += ` AND (
      COALESCE(
        NULLIF(m.NombrePersona, ''),
        TRIM(CONCAT_WS(' ', m.PrimerNombre, m.SegundoNombre, m.PrimerApellido, m.SegundoApellido))
      ) LIKE ?
      OR m.CorreoElectronico LIKE ?
    )`;

    const likeValue = `%${filters.nombre}%`;
    params.push(likeValue, likeValue);
  }

  sql += ' ORDER BY nombreMedico ASC';

  const [rows] = await getPool().query(sql, params);
  return rows;
}

async function listDoctorVisitHistory(
  { codigoMedico, codigoUsuario = null, codigoVisitador = null },
  executor
) {
  const doctorId = asNumber(codigoMedico);

  if (!doctorId) {
    return [];
  }

  const { visitTableKey, medicoTableKey, visitColumns, medicoColumns } =
    await resolveDoctorHistorySources(executor);

  if (!visitColumns.size || !medicoColumns.size) {
    return [];
  }

  const visitIdColumn = pickColumn(visitColumns, ['CodigoVisitaMedica', 'CodVisitaMedica']);
  const visitDoctorColumn = pickColumn(visitColumns, ['CodigoMedico', 'CodMedico']);
  const visitEntityColumn = pickColumn(visitColumns, ['CodigoEntidad', 'CodEntidad']);
  const visitActiveColumn = pickColumn(visitColumns, [
    'IsActiva',
    'IsActivo',
    'IsActive',
    'isActive'
  ]);
  const visitEstadoColumn = pickColumn(visitColumns, ['CodigoEstado', 'CodEstado']);
  const visitFechaProgramadaColumn = pickColumn(visitColumns, [
    'FechaProgramada',
    'Fecha_Programada'
  ]);
  const visitHoraProgramadaColumn = pickColumn(visitColumns, [
    'HoraProgramada',
    'Hora_Programada'
  ]);
  const visitFechaColumn = pickColumn(visitColumns, ['Fecha', 'FechaRegistro']);
  const visitHoraColumn = pickColumn(visitColumns, ['Hora']);
  const visitUsuarioColumn = pickColumn(visitColumns, ['CodigoUsuario', 'CodUsuario']);
  const visitVisitadorColumn = pickColumn(visitColumns, [
    'CodigoVisitador',
    'CodVisitador'
  ]);
  const visitDetalleColumn = pickColumn(visitColumns, ['DetalleVisita']);
  const visitComentariosColumn = pickColumn(visitColumns, ['Comentarios']);
  const visitNombreColumn = pickColumn(visitColumns, ['NombreVisita']);
  const visitJustificacionColumn = pickColumn(visitColumns, ['Justificacion']);
  const visitClasificacionColumn = pickColumn(visitColumns, ['ClasificacionVisita']);

  const medicoIdColumn = pickColumn(medicoColumns, ['CodigoMedico', 'CodMedico']);

  if (!visitIdColumn || !visitDoctorColumn || !medicoIdColumn) {
    return [];
  }

  const estadoColumns = await getTableColumns('estado', executor);
  const estadoCodeColumn = pickColumn(estadoColumns, ['CodigoEstado', 'CodEstado']);
  const estadoNameColumn = pickColumn(estadoColumns, [
    'Estado',
    'NombreEstado',
    'Descripcion'
  ]);
  const canJoinEstado = Boolean(
    estadoColumns.size && visitEstadoColumn && estadoCodeColumn && estadoNameColumn
  );

  const doctorNameExpression = buildDoctorNameExpression('m', medicoColumns);
  const params = [doctorId];
  let sql = `SELECT
      v.${escapeIdentifier(visitIdColumn)} AS codigoVisitaMedica,
      ${
        visitFechaProgramadaColumn
          ? `v.${escapeIdentifier(visitFechaProgramadaColumn)}`
          : 'NULL'
      } AS fechaProgramada,
      ${
        visitHoraProgramadaColumn
          ? `v.${escapeIdentifier(visitHoraProgramadaColumn)}`
          : 'NULL'
      } AS horaProgramada,
      ${visitFechaColumn ? `v.${escapeIdentifier(visitFechaColumn)}` : 'NULL'} AS fechaRegistro,
      ${visitHoraColumn ? `v.${escapeIdentifier(visitHoraColumn)}` : 'NULL'} AS horaRegistro,
      ${visitEstadoColumn ? `v.${escapeIdentifier(visitEstadoColumn)}` : 'NULL'} AS codigoEstado,
      ${
        canJoinEstado
          ? `e.${escapeIdentifier(estadoNameColumn)}`
          : 'NULL'
      } AS estadoVisita,
      ${visitDetalleColumn ? `v.${escapeIdentifier(visitDetalleColumn)}` : 'NULL'} AS detalleVisita,
      ${
        visitComentariosColumn ? `v.${escapeIdentifier(visitComentariosColumn)}` : 'NULL'
      } AS comentarios,
      ${visitNombreColumn ? `v.${escapeIdentifier(visitNombreColumn)}` : 'NULL'} AS nombreVisita,
      ${
        visitJustificacionColumn
          ? `v.${escapeIdentifier(visitJustificacionColumn)}`
          : 'NULL'
      } AS justificacion,
      ${
        visitClasificacionColumn
          ? `v.${escapeIdentifier(visitClasificacionColumn)}`
          : 'NULL'
      } AS clasificacionVisita,
      ${visitEntityColumn ? `v.${escapeIdentifier(visitEntityColumn)}` : 'NULL'} AS codigoEntidad,
      ${doctorNameExpression} AS nombreMedico
    FROM ${tables[visitTableKey]} v
    INNER JOIN ${tables[medicoTableKey]} m
      ON m.${escapeIdentifier(medicoIdColumn)} = v.${escapeIdentifier(visitDoctorColumn)}
    ${
      canJoinEstado
        ? `LEFT JOIN ${tables.estado} e
      ON e.${escapeIdentifier(estadoCodeColumn)} = v.${escapeIdentifier(visitEstadoColumn)}
      AND IFNULL(e.IsActivo, 1) = 1`
        : ''
    }
    WHERE v.${escapeIdentifier(visitDoctorColumn)} = ?`;

  if (visitEntityColumn) {
    sql += ` AND v.${escapeIdentifier(visitEntityColumn)} = 1`;
  }

  if (visitActiveColumn) {
    sql += ` AND IFNULL(v.${escapeIdentifier(visitActiveColumn)}, 1) = 1`;
  }

  const normalizedUsuario = asNumber(codigoUsuario);
  const normalizedVisitador = asNumber(codigoVisitador);
  const ownerConditions = [];

  if (visitUsuarioColumn && normalizedUsuario) {
    ownerConditions.push(`v.${escapeIdentifier(visitUsuarioColumn)} = ?`);
    params.push(normalizedUsuario);
  }

  if (visitVisitadorColumn && normalizedVisitador) {
    ownerConditions.push(`v.${escapeIdentifier(visitVisitadorColumn)} = ?`);
    params.push(normalizedVisitador);
  }

  if (ownerConditions.length) {
    sql += ` AND (${ownerConditions.join(' OR ')})`;
  }

  const orderFields = [];

  if (visitFechaProgramadaColumn) {
    orderFields.push(`v.${escapeIdentifier(visitFechaProgramadaColumn)} DESC`);
  } else if (visitFechaColumn) {
    orderFields.push(`v.${escapeIdentifier(visitFechaColumn)} DESC`);
  }

  if (visitHoraProgramadaColumn) {
    orderFields.push(`v.${escapeIdentifier(visitHoraProgramadaColumn)} DESC`);
  } else if (visitHoraColumn) {
    orderFields.push(`v.${escapeIdentifier(visitHoraColumn)} DESC`);
  }

  orderFields.push(`v.${escapeIdentifier(visitIdColumn)} DESC`);
  sql += ` ORDER BY ${orderFields.join(', ')}`;

  const [rows] = await resolveExecutor(executor).query(sql, params);

  return (rows || []).map((row) => {
    const codigoEstado = asNumber(row.codigoEstado);
    const comentario = [
      asString(row.detalleVisita),
      asString(row.comentarios),
      asString(row.justificacion),
      asString(row.nombreVisita)
    ].find(Boolean);

    return {
      codigoVisitaMedica: asNumber(row.codigoVisitaMedica),
      codigoMedico: doctorId,
      codigoEntidad: asNumber(row.codigoEntidad),
      fechaVisita: normalizeDate(row.fechaProgramada) || normalizeDate(row.fechaRegistro),
      horaVisita: asString(row.horaProgramada || row.horaRegistro),
      codigoEstado,
      estado: asString(row.estadoVisita),
      comentario: comentario || '',
      clasificacionVisita: asNumber(row.clasificacionVisita) || 0,
      nombreMedico: asString(row.nombreMedico),
      isCompletada: codigoEstado === 5
    };
  });
}

async function listBranchVisitHistory(
  { codigoSucursal, codigoUsuario = null, codigoVisitador = null },
  executor
) {
  const branchId = asNumber(codigoSucursal);

  if (!branchId) {
    return [];
  }

  let visitColumns = await getTableColumns('visitaMedica', executor);
  let visitTableKey = 'visitaMedica';

  if (!visitColumns.size) {
    visitColumns = await getTableColumns('visitaMedicaLocal', executor);
    visitTableKey = 'visitaMedicaLocal';
  }

  if (!visitColumns.size) {
    return [];
  }

  const visitIdColumn = pickColumn(visitColumns, ['CodigoVisitaMedica', 'CodVisitaMedica']);
  const visitBranchColumn = pickColumn(visitColumns, ['CodigoSucursal', 'CodSucursal']);
  const visitDoctorColumn = pickColumn(visitColumns, ['CodigoMedico', 'CodMedico']);
  const visitEntityColumn = pickColumn(visitColumns, ['CodigoEntidad', 'CodEntidad']);
  const visitActiveColumn = pickColumn(visitColumns, [
    'IsActiva',
    'IsActivo',
    'IsActive',
    'isActive'
  ]);
  const visitEstadoColumn = pickColumn(visitColumns, ['CodigoEstado', 'CodEstado']);
  const visitFechaProgramadaColumn = pickColumn(visitColumns, [
    'FechaProgramada',
    'Fecha_Programada'
  ]);
  const visitHoraProgramadaColumn = pickColumn(visitColumns, [
    'HoraProgramada',
    'Hora_Programada'
  ]);
  const visitFechaColumn = pickColumn(visitColumns, ['Fecha', 'FechaRegistro']);
  const visitHoraColumn = pickColumn(visitColumns, ['Hora']);
  const visitUsuarioColumn = pickColumn(visitColumns, ['CodigoUsuario', 'CodUsuario']);
  const visitVisitadorColumn = pickColumn(visitColumns, [
    'CodigoVisitador',
    'CodVisitador'
  ]);
  const visitDetalleColumn = pickColumn(visitColumns, ['DetalleVisita']);
  const visitComentariosColumn = pickColumn(visitColumns, ['Comentarios']);
  const visitNombreColumn = pickColumn(visitColumns, ['NombreVisita']);
  const visitJustificacionColumn = pickColumn(visitColumns, ['Justificacion']);

  if (!visitIdColumn || !visitBranchColumn) {
    return [];
  }

  const estadoColumns = await getTableColumns('estado', executor);
  const estadoCodeColumn = pickColumn(estadoColumns, ['CodigoEstado', 'CodEstado']);
  const estadoNameColumn = pickColumn(estadoColumns, [
    'Estado',
    'NombreEstado',
    'Descripcion'
  ]);
  const canJoinEstado = Boolean(
    estadoColumns.size && visitEstadoColumn && estadoCodeColumn && estadoNameColumn
  );

  const params = [branchId];
  let sql = `SELECT
      v.${escapeIdentifier(visitIdColumn)} AS codigoVisitaMedica,
      ${
        visitFechaProgramadaColumn
          ? `v.${escapeIdentifier(visitFechaProgramadaColumn)}`
          : 'NULL'
      } AS fechaProgramada,
      ${
        visitHoraProgramadaColumn
          ? `v.${escapeIdentifier(visitHoraProgramadaColumn)}`
          : 'NULL'
      } AS horaProgramada,
      ${visitFechaColumn ? `v.${escapeIdentifier(visitFechaColumn)}` : 'NULL'} AS fechaRegistro,
      ${visitHoraColumn ? `v.${escapeIdentifier(visitHoraColumn)}` : 'NULL'} AS horaRegistro,
      ${visitEstadoColumn ? `v.${escapeIdentifier(visitEstadoColumn)}` : 'NULL'} AS codigoEstado,
      ${
        canJoinEstado
          ? `e.${escapeIdentifier(estadoNameColumn)}`
          : 'NULL'
      } AS estadoVisita,
      ${visitDetalleColumn ? `v.${escapeIdentifier(visitDetalleColumn)}` : 'NULL'} AS detalleVisita,
      ${
        visitComentariosColumn ? `v.${escapeIdentifier(visitComentariosColumn)}` : 'NULL'
      } AS comentarios,
      ${visitNombreColumn ? `v.${escapeIdentifier(visitNombreColumn)}` : 'NULL'} AS nombreVisita,
      ${
        visitJustificacionColumn
          ? `v.${escapeIdentifier(visitJustificacionColumn)}`
          : 'NULL'
      } AS justificacion,
      COALESCE(
        NULLIF(sc.${sucursalCatalogColumns.name}, ''),
        CONCAT('Sucursal ', v.${escapeIdentifier(visitBranchColumn)})
      ) AS nombreSucursal,
      v.${escapeIdentifier(visitBranchColumn)} AS codigoSucursal
    FROM ${tables[visitTableKey]} v
    LEFT JOIN ${tables.sucursalCatalog} sc
      ON sc.${sucursalCatalogColumns.id} = v.${escapeIdentifier(visitBranchColumn)}
    ${
      canJoinEstado
        ? `LEFT JOIN ${tables.estado} e
      ON e.${escapeIdentifier(estadoCodeColumn)} = v.${escapeIdentifier(visitEstadoColumn)}
      AND IFNULL(e.IsActivo, 1) = 1`
        : ''
    }
    WHERE v.${escapeIdentifier(visitBranchColumn)} = ?`;

  if (visitEntityColumn) {
    sql += ` AND v.${escapeIdentifier(visitEntityColumn)} = 2`;
  }

  if (visitDoctorColumn) {
    sql += ` AND v.${escapeIdentifier(visitDoctorColumn)} = 1`;
  }

  if (visitActiveColumn) {
    sql += ` AND IFNULL(v.${escapeIdentifier(visitActiveColumn)}, 1) = 1`;
  }

  const normalizedUsuario = asNumber(codigoUsuario);
  const normalizedVisitador = asNumber(codigoVisitador);
  const ownerConditions = [];

  if (visitUsuarioColumn && normalizedUsuario) {
    ownerConditions.push(`v.${escapeIdentifier(visitUsuarioColumn)} = ?`);
    params.push(normalizedUsuario);
  }

  if (visitVisitadorColumn && normalizedVisitador) {
    ownerConditions.push(`v.${escapeIdentifier(visitVisitadorColumn)} = ?`);
    params.push(normalizedVisitador);
  }

  if (ownerConditions.length) {
    sql += ` AND (${ownerConditions.join(' OR ')})`;
  }

  const orderFields = [];

  if (visitFechaProgramadaColumn) {
    orderFields.push(`v.${escapeIdentifier(visitFechaProgramadaColumn)} DESC`);
  } else if (visitFechaColumn) {
    orderFields.push(`v.${escapeIdentifier(visitFechaColumn)} DESC`);
  }

  if (visitHoraProgramadaColumn) {
    orderFields.push(`v.${escapeIdentifier(visitHoraProgramadaColumn)} DESC`);
  } else if (visitHoraColumn) {
    orderFields.push(`v.${escapeIdentifier(visitHoraColumn)} DESC`);
  }

  orderFields.push(`v.${escapeIdentifier(visitIdColumn)} DESC`);
  sql += ` ORDER BY ${orderFields.join(', ')}`;

  const [rows] = await resolveExecutor(executor).query(sql, params);

  return (rows || []).map((row) => {
    const codigoEstado = asNumber(row.codigoEstado);
    const comentario = [
      asString(row.detalleVisita),
      asString(row.comentarios),
      asString(row.justificacion),
      asString(row.nombreVisita)
    ].find(Boolean);

    return {
      codigoVisitaMedica: asNumber(row.codigoVisitaMedica),
      codigoSucursal: asNumber(row.codigoSucursal),
      fechaVisita: normalizeDate(row.fechaProgramada) || normalizeDate(row.fechaRegistro),
      horaVisita: asString(row.horaProgramada || row.horaRegistro),
      codigoEstado,
      estado: asString(row.estadoVisita),
      comentario: comentario || '',
      nombreSucursal: asString(row.nombreSucursal),
      isCompletada: codigoEstado === 5
    };
  });
}

async function listAssignedBranches(assignmentCode, filters = {}) {
  const params = [assignmentCode];
  let sql = `SELECT
      sxv.CodigoSucursalXVisitador AS codigoSucursalXVisitador,
      sxv.CodigoSucursal AS codigoSucursal,
      sxv.CodigoInternoSucursal AS codigoInternoSucursal,
      sxv.Fecha AS fechaAsignacion,
      sxv.Hora AS horaAsignacion,
      COALESCE(
        NULLIF(sc.${sucursalCatalogColumns.name}, ''),
        CONCAT('Sucursal ', sxv.CodigoSucursal)
      ) AS nombreSucursal,
      NULLIF(sc.${sucursalCatalogColumns.address}, '') AS direccionSucursal,
      NULLIF(sc.${sucursalCatalogColumns.email}, '') AS correoSucursal,
      COALESCE(
        NULLIF(sxv.CodigoInternoSucursal, ''),
        NULLIF(sc.${sucursalCatalogColumns.code}, ''),
        CAST(sxv.CodigoSucursal AS CHAR)
      ) AS numeroSucursal
    FROM ${tables.sucursalesXVisitador} sxv
    LEFT JOIN ${tables.sucursalCatalog} sc
      ON sc.${sucursalCatalogColumns.id} = sxv.CodigoSucursal
    WHERE sxv.CodigoUsuarioVisitador = ?
      AND IFNULL(sxv.IsActivo, 1) = 1
      AND (
        sc.${sucursalCatalogColumns.id} IS NULL
        OR IFNULL(sc.${sucursalCatalogColumns.isActive}, 1) = 1
      )`;

  if (filters.sucursal) {
    sql += ' AND sxv.CodigoSucursal = ?';
    params.push(Number(filters.sucursal));
  }

  sql += ` ORDER BY
    COALESCE(
      NULLIF(sxv.CodigoInternoSucursal, ''),
      NULLIF(sc.${sucursalCatalogColumns.code}, ''),
      CAST(sxv.CodigoSucursal AS CHAR)
    ) ASC`;

  const [rows] = await getPool().query(sql, params);
  return rows;
}

async function findSucursalInfoByCountryAndCode(
  { codigoPais, codigoSucursal },
  executor
) {
  const viewColumns = await getTableColumns('sucursalInfoView', executor);
  const codigoSucursalColumn = pickColumn(viewColumns, [
    'Codigo_Sucursal',
    'CodigoSucursal',
    'CodSucursal'
  ]);
  const codigoPaisColumn = pickColumn(viewColumns, [
    'Codigo_Pais',
    'CodigoPais',
    'CodPais'
  ]);

  if (!codigoSucursalColumn || !codigoPaisColumn) {
    throw new AppError(
      'Sucursal info view is missing required Codigo_Sucursal/Codigo_Pais columns.',
      500
    );
  }

  const [rows] = await resolveExecutor(executor).execute(
    `SELECT *
    FROM ${tables.sucursalInfoView}
    WHERE ${escapeIdentifier(codigoPaisColumn)} = ?
      AND ${escapeIdentifier(codigoSucursalColumn)} = ?
    LIMIT 1`,
    [codigoPais, codigoSucursal]
  );

  const row = rows[0] || null;

  if (!row) {
    return null;
  }

  return {
    codigoSucursal: asNumber(
      getRowValue(row, ['Codigo_Sucursal', 'CodigoSucursal', 'CodSucursal'])
    ),
    empresa: normalizeOptionalText(
      getRowValue(row, [
        'Empresa',
        'Nombre_Empresa',
        'NombreEmpresa',
        'RazonSocial',
        'Compania'
      ])
    ),
    nombreSucursal: normalizeOptionalText(
      getRowValue(row, ['Nombre_Sucursal', 'NombreSucursal'])
    ),
    codigoInternoSucursal: normalizeOptionalText(
      getRowValue(row, ['Codigo_InternoSucursal', 'CodigoInternoSucursal'])
    ),
    codigoPais: asNumber(
      getRowValue(row, ['Codigo_Pais', 'CodigoPais', 'CodPais'])
    ),
    correoSucursal: normalizeOptionalText(
      getRowValue(row, ['correoSucursal', 'CorreoSucursal', 'Correo'])
    ),
    direccion: normalizeOptionalText(
      getRowValue(row, ['Direccion', 'DireccionSucursal'])
    ),
    telefono: normalizeOptionalText(getRowValue(row, ['Telefono'])),
    codGA: asNumber(getRowValue(row, ['CodGA', 'CodigoGA'])),
    nombreGA: normalizeOptionalText(
      getRowValue(row, ['Nombre_PersonasGA', 'NombrePersonaGA', 'NombreGA'])
    ),
    correoGA: normalizeOptionalText(
      getRowValue(row, ['Correo_PersonasGA', 'CorreoPersonaGA', 'CorreoGA'])
    ),
    telefonoGA: normalizeOptionalText(
      getRowValue(row, ['Telefono_PersonasGA', 'TelefonoPersonaGA', 'TelefonoGA'])
    ),
    codGF: asNumber(getRowValue(row, ['CodGF', 'CodigoGF'])),
    nombreGF: normalizeOptionalText(
      getRowValue(row, ['Nombre_PersonasGF', 'NombrePersonaGF', 'NombreGF'])
    ),
    correoGF: normalizeOptionalText(
      getRowValue(row, ['Correo_PersonasGF', 'CorreoPersonaGF', 'CorreoGF'])
    ),
    telefonoGF: normalizeOptionalText(
      getRowValue(row, ['Telefono_PersonasGF', 'TelefonoPersonaGF', 'TelefonoGF'])
    ),
    codGO: asNumber(getRowValue(row, ['CodGO', 'CodigoGO'])),
    nombreGO: normalizeOptionalText(
      getRowValue(row, ['Nombre_PersonaGO', 'NombrePersonaGO', 'NombreGO'])
    ),
    correoGO: normalizeOptionalText(
      getRowValue(row, ['Correo_PersonaGO', 'CorreoPersonaGO', 'CorreoGO'])
    ),
    telefonoGO: normalizeOptionalText(
      getRowValue(row, ['Telefono_PersonaGO', 'TelefonoPersonaGO', 'TelefonoGO'])
    ),
    raw: sanitizeRecord(row)
  };
}

async function findPersonaByCodeFromTable(tableKey, codigoPersona, executor) {
  const codeText = asString(codigoPersona);
  const codeNumber = asNumber(codigoPersona);

  if (!codeText && !Number.isFinite(codeNumber)) {
    return null;
  }

  const columns = await getTableColumns(tableKey, executor);

  if (!columns.size) {
    return null;
  }

  const idColumn = pickColumn(columns, [
    'Codigo_Personas',
    'CodigoPersonas',
    'CodigoPersona',
    'idPersona'
  ]);

  if (!idColumn) {
    return null;
  }

  const activeColumn = pickColumn(columns, [
    'isActivo',
    'IsActivo',
    'IsActiva',
    'isActive'
  ]);

  const params = [Number.isFinite(codeNumber) ? codeNumber : codeText];
  let sql = `SELECT *
    FROM ${tables[tableKey]}
    WHERE ${escapeIdentifier(idColumn)} = ?`;

  if (activeColumn) {
    sql += ` AND IFNULL(${escapeIdentifier(activeColumn)}, 1) = ?`;
    params.push(1);
  }

  sql += ' LIMIT 1';

  const [rows] = await resolveExecutor(executor).execute(sql, params);
  const row = rows[0] || null;

  if (!row) {
    return null;
  }

  const nombrePersona = normalizeOptionalText(
    getRowValue(row, [
      'NombrePersona',
      'Nombre_Personas',
      'NombreCompleto',
      'Nombre'
    ])
  );

  return {
    codigoPersona: asNumber(getRowValue(row, [idColumn])),
    nombrePersona,
    correo: normalizeOptionalText(
      getRowValue(row, ['Correo_electronico', 'CorreoElectronico', 'Email', 'Correo'])
    ),
    telefono: normalizeOptionalText(
      getRowValue(row, [
        'Telefono_Movil',
        'TelefonoMovil',
        'Numero_telefono',
        'NumeroTelefono',
        'Telefono',
        'Celular'
      ])
    ),
    detalle: sanitizeRecord(row, [
      idColumn,
      'NombrePersona',
      'Nombre_Personas',
      'NombreCompleto',
      'Nombre',
      'Correo_electronico',
      'CorreoElectronico',
      'Email',
      'Telefono_Movil',
      'TelefonoMovil',
      'Telefono',
      'Celular'
    ])
  };
}

async function findDoctorByAssignment(assignmentCode, codigoMedico, executor) {
  const [assignmentColumns, medicoColumns] = await Promise.all([
    getTableColumns('medicosXVisitador', executor),
    getTableColumns('medico', executor)
  ]);

  const assignmentUserColumn = pickColumn(assignmentColumns, [
    'CodigoUsuario',
    'CodigoUsuarioVisitador',
    'CodigoVisitador'
  ]);
  const assignmentDoctorColumn = pickColumn(assignmentColumns, ['CodigoMedico', 'CodMedico']);
  const assignmentActiveColumn = pickColumn(assignmentColumns, [
    'IsActivo',
    'IsActiva',
    'isActive'
  ]);
  const medicoIdColumn = pickColumn(medicoColumns, ['CodigoMedico', 'CodMedico']);
  const medicoActiveColumn = pickColumn(medicoColumns, [
    'isActivo',
    'IsActivo',
    'IsActiva',
    'isActive'
  ]);

  if (!assignmentUserColumn || !assignmentDoctorColumn || !medicoIdColumn) {
    throw new AppError('Directory doctor assignment mapping is not configured correctly.', 500);
  }

  const params = [assignmentCode, codigoMedico];
  let sql = `SELECT m.*
    FROM ${tables.medicosXVisitador} mxv
    INNER JOIN ${tables.medico} m
      ON m.${escapeIdentifier(medicoIdColumn)} = mxv.${escapeIdentifier(assignmentDoctorColumn)}
    WHERE mxv.${escapeIdentifier(assignmentUserColumn)} = ?
      AND mxv.${escapeIdentifier(assignmentDoctorColumn)} = ?`;

  if (assignmentActiveColumn) {
    sql += ` AND IFNULL(mxv.${escapeIdentifier(assignmentActiveColumn)}, 1) = ?`;
    params.push(1);
  }

  if (medicoActiveColumn) {
    sql += ` AND IFNULL(m.${escapeIdentifier(medicoActiveColumn)}, 1) = ?`;
    params.push(1);
  }

  sql += ' LIMIT 1';

  const [rows] = await resolveExecutor(executor).execute(sql, params);
  const row = rows[0] || null;

  if (!row) {
    return null;
  }

  return {
    codigoMedico: asNumber(getRowValue(row, ['CodigoMedico', 'CodMedico'])),
    primerNombre: asString(getRowValue(row, ['PrimerNombre', 'Nombre1'])),
    segundoNombre: asString(getRowValue(row, ['SegundoNombre', 'Nombre2'])),
    primerApellido: asString(getRowValue(row, ['PrimerApellido', 'Apellido1'])),
    segundoApellido: asString(getRowValue(row, ['SegundoApellido', 'Apellido2'])),
    fechaNacimiento: normalizeDate(
      getRowValue(row, ['FechaNacimiento', 'FechaNacimientoMedico', 'FecNacimiento'])
    ),
    identificacion: asString(getRowValue(row, ['Identificacion', 'Identidad'])),
    numeroColegiacion: asString(
      getRowValue(row, ['NoColegiacion', 'NumeroColegiacion', 'NroColegiacion'])
    ),
    correoPersonal: asString(getRowValue(row, ['CorreoElectronico', 'CorreoPersonal', 'Email'])),
    telefonoMovil: asString(getRowValue(row, ['TelefonoMovil', 'TelefonoCelular', 'Celular'])),
    codigoCategoria: asNumber(
      getRowValue(row, ['CodigoCategoria', 'CodigoCategoriaMedico', 'CodCategoriaMedico'])
    ),
    codigoDepartamento: asNumber(
      getRowValue(row, ['CodigoGeoDivisionL1', 'CodigoDepartamento', 'CodDepartamento'])
    ),
    codigoMunicipio: asNumber(
      getRowValue(row, ['CodigoGeoDivisionL2', 'CodigoMunicipio', 'CodMunicipio'])
    ),
    direccion: asString(getRowValue(row, ['Direccion', 'DireccionMedico'])),
    pacientesSemana: asNumber(
      getRowValue(row, ['PacientesSemana', 'PacientesPorSemana', 'CantidadPacientes'])
    ),
    codigoRangoPrecioConsulta: asNumber(
      getRowValue(row, ['CodigoRangoPrecioConsulta', 'CodigoCostoConsulta'])
    )
  };
}

async function listDoctorSpecialties(codigoMedico, executor) {
  const tableKey = 'especialidadesByMedico';
  const [relationColumns, specialtyColumns] = await Promise.all([
    getTableColumns(tableKey, executor),
    getTableColumns('especialidad', executor)
  ]);

  const doctorColumn = pickColumn(relationColumns, ['CodMedico', 'CodigoMedico']);
  const specialtyColumn = pickColumn(relationColumns, ['CodigoEspecialidad', 'CodEspecialidad']);
  const principalColumn = pickColumn(relationColumns, ['IsPrincipal', 'Principal', 'EsPrincipal']);
  const relationActiveColumn = pickColumn(relationColumns, [
    'IsActiva',
    'IsActivo',
    'isActive'
  ]);

  if (!doctorColumn || !specialtyColumn) {
    return [];
  }

  const specialtyIdColumn = pickColumn(specialtyColumns, [
    'CodigoEspecialidad',
    'CodEspecialidad'
  ]);
  const specialtyNameColumn = pickColumn(specialtyColumns, [
    'NombreEspecialidad',
    'Especialidad',
    'Nombre'
  ]);
  const specialtyActiveColumn = pickColumn(specialtyColumns, [
    'IsActivo',
    'IsActiva',
    'isActive'
  ]);

  const params = [codigoMedico];
  let sql = `SELECT
      rel.${escapeIdentifier(specialtyColumn)} AS relationSpecialtyId,
      ${
        principalColumn
          ? `rel.${escapeIdentifier(principalColumn)}`
          : '0'
      } AS relationIsPrincipal,
      ${
        specialtyIdColumn
          ? `esp.${escapeIdentifier(specialtyIdColumn)}`
          : 'NULL'
      } AS catalogSpecialtyId,
      ${
        specialtyNameColumn
          ? `esp.${escapeIdentifier(specialtyNameColumn)}`
          : 'NULL'
      } AS catalogSpecialtyName
    FROM ${tables[tableKey]} rel
    LEFT JOIN ${tables.especialidad} esp
      ON ${
        specialtyIdColumn
          ? `esp.${escapeIdentifier(specialtyIdColumn)} = rel.${escapeIdentifier(specialtyColumn)}`
          : '1 = 0'
      }
    WHERE rel.${escapeIdentifier(doctorColumn)} = ?`;

  if (relationActiveColumn) {
    sql += ` AND IFNULL(rel.${escapeIdentifier(relationActiveColumn)}, 1) = ?`;
    params.push(1);
  }

  if (specialtyActiveColumn && specialtyIdColumn) {
    sql += ` AND (
      esp.${escapeIdentifier(specialtyIdColumn)} IS NULL
      OR IFNULL(esp.${escapeIdentifier(specialtyActiveColumn)}, 1) = ?
    )`;
    params.push(1);
  }

  const [rows] = await resolveExecutor(executor).execute(sql, params);

  const items = (rows || [])
    .map((row) => {
      const specialtyId = asNumber(
        row.catalogSpecialtyId ?? row.relationSpecialtyId
      );

      if (!Number.isFinite(specialtyId)) {
        return null;
      }

      return {
        codigoEspecialidad: specialtyId,
        nombreEspecialidad:
          asString(row.catalogSpecialtyName) || `Especialidad ${specialtyId}`,
        isPrincipal: asBoolean(row.relationIsPrincipal)
      };
    })
    .filter(Boolean);

  const uniqueBySpecialty = new Map();

  for (const item of items) {
    if (!uniqueBySpecialty.has(item.codigoEspecialidad)) {
      uniqueBySpecialty.set(item.codigoEspecialidad, item);
      continue;
    }

    if (item.isPrincipal) {
      uniqueBySpecialty.set(item.codigoEspecialidad, item);
    }
  }

  return [...uniqueBySpecialty.values()].sort((a, b) =>
    a.nombreEspecialidad.localeCompare(b.nombreEspecialidad, 'es')
  );
}

async function listDoctorLines(codigoMedico, executor) {
  const [relationColumns, lineColumns] = await Promise.all([
    getTableColumns('lineasProductoXMedico', executor),
    getTableColumns('lineaProducto', executor)
  ]);

  const doctorColumn = pickColumn(relationColumns, ['CodMedico', 'CodigoMedico']);
  const lineColumn = pickColumn(relationColumns, [
    'CodigoLineaProducto',
    'CodLineaProducto',
    'CodigoLinea'
  ]);
  const relationActiveColumn = pickColumn(relationColumns, [
    'IsActivo',
    'IsActiva',
    'isActive'
  ]);

  if (!doctorColumn || !lineColumn) {
    return [];
  }

  const lineIdColumn = pickColumn(lineColumns, [
    'CodigoLineaProducto',
    'CodigoLinea',
    'CodLineaProducto'
  ]);
  const lineNameColumn = pickColumn(lineColumns, [
    'NombreLineaProducto',
    'NombreLinea',
    'LineaProducto',
    'Nombre'
  ]);
  const lineActiveColumn = pickColumn(lineColumns, ['IsActivo', 'IsActiva', 'isActive']);

  const params = [codigoMedico];
  let sql = `SELECT
      rel.${escapeIdentifier(lineColumn)} AS relationLineId,
      ${lineIdColumn ? `ln.${escapeIdentifier(lineIdColumn)}` : 'NULL'} AS catalogLineId,
      ${lineNameColumn ? `ln.${escapeIdentifier(lineNameColumn)}` : 'NULL'} AS catalogLineName
    FROM ${tables.lineasProductoXMedico} rel
    LEFT JOIN ${tables.lineaProducto} ln
      ON ${
        lineIdColumn
          ? `ln.${escapeIdentifier(lineIdColumn)} = rel.${escapeIdentifier(lineColumn)}`
          : '1 = 0'
      }
    WHERE rel.${escapeIdentifier(doctorColumn)} = ?`;

  if (relationActiveColumn) {
    sql += ` AND IFNULL(rel.${escapeIdentifier(relationActiveColumn)}, 1) = ?`;
    params.push(1);
  }

  if (lineActiveColumn && lineIdColumn) {
    sql += ` AND (
      ln.${escapeIdentifier(lineIdColumn)} IS NULL
      OR IFNULL(ln.${escapeIdentifier(lineActiveColumn)}, 1) = ?
    )`;
    params.push(1);
  }

  const [rows] = await resolveExecutor(executor).execute(sql, params);

  const items = (rows || [])
    .map((row) => {
      const codigoLineaProducto = asNumber(row.catalogLineId ?? row.relationLineId);

      if (!Number.isFinite(codigoLineaProducto)) {
        return null;
      }

      return {
        codigoLineaProducto,
        nombreLineaProducto:
          asString(row.catalogLineName) || `Linea ${codigoLineaProducto}`
      };
    })
    .filter(Boolean);

  const uniqueByLine = new Map();

  for (const item of items) {
    if (!uniqueByLine.has(item.codigoLineaProducto)) {
      uniqueByLine.set(item.codigoLineaProducto, item);
    }
  }

  return [...uniqueByLine.values()].sort((a, b) =>
    a.nombreLineaProducto.localeCompare(b.nombreLineaProducto, 'es')
  );
}

async function listDoctorPlazas(codigoMedico, executor) {
  const [plazaColumns, hospitalColumns] = await Promise.all([
    getTableColumns('plazaMedica', executor),
    getTableColumns('hospital', executor)
  ]);

  const plazaIdColumn = pickColumn(plazaColumns, [
    'CodigoPlazaMedica',
    'CodPlazaMedica',
    'CodigoPlaza'
  ]);
  const doctorColumn = pickColumn(plazaColumns, ['CodigoMedico', 'CodMedico']);
  const hospitalColumn = pickColumn(plazaColumns, [
    'CodigoHospitalClinica',
    'CodHospitalClinica',
    'CodigoHospital'
  ]);
  const nombrePlazaColumn = pickColumn(plazaColumns, [
    'NombrePlaza',
    'NombrePlazaMedica',
    'Nombre'
  ]);
  const direccionColumn = pickColumn(plazaColumns, ['Direccion', 'DireccionPlaza']);
  const telefonoClinicaColumn = pickColumn(plazaColumns, ['TelefonoClinica', 'Telefono']);
  const nombreContactoColumn = pickColumn(plazaColumns, ['NombreContacto']);
  const puestoContactoColumn = pickColumn(plazaColumns, ['PuestoContacto', 'CargoContacto']);
  const fechaNacimientoContactoColumn = pickColumn(plazaColumns, [
    'FechaNacimientoContacto',
    'FechaNacContacto'
  ]);
  const telefonoMovilContactoColumn = pickColumn(plazaColumns, [
    'TelefonoMovilContacto',
    'TelefonoContacto',
    'TelefonoMovil'
  ]);
  const principalColumn = pickColumn(plazaColumns, ['IsPrincipal', 'Principal', 'EsPrincipal']);
  const plazaActiveColumn = pickColumn(plazaColumns, ['IsActivo', 'IsActiva', 'isActive']);

  if (!doctorColumn) {
    return [];
  }

  const hospitalIdColumn = pickColumn(hospitalColumns, [
    'CodigoHospitalClinica',
    'CodHospitalClinica',
    'CodigoHospital'
  ]);
  const hospitalNameColumn = pickColumn(hospitalColumns, [
    'NombreHospitalClinica',
    'NombreHospital',
    'Nombre'
  ]);
  const hospitalActiveColumn = pickColumn(hospitalColumns, [
    'IsActivo',
    'IsActiva',
    'isActive'
  ]);

  const joinCondition = hospitalColumn && hospitalIdColumn
    ? `h.${escapeIdentifier(hospitalIdColumn)} = p.${escapeIdentifier(hospitalColumn)}`
    : '1 = 0';

  const params = [codigoMedico];
  let sql = `SELECT
      ${selectColumnOrNull('p', plazaIdColumn, 'plazaId')},
      ${selectColumnOrNull('p', hospitalColumn, 'hospitalId')},
      ${selectColumnOrNull('p', nombrePlazaColumn, 'nombrePlaza')},
      ${selectColumnOrNull('p', direccionColumn, 'direccionPlaza')},
      ${selectColumnOrNull('p', telefonoClinicaColumn, 'telefonoClinica')},
      ${selectColumnOrNull('p', nombreContactoColumn, 'nombreContacto')},
      ${selectColumnOrNull('p', puestoContactoColumn, 'puestoContacto')},
      ${selectColumnOrNull('p', fechaNacimientoContactoColumn, 'fechaNacimientoContacto')},
      ${selectColumnOrNull('p', telefonoMovilContactoColumn, 'telefonoMovilContacto')},
      ${principalColumn ? `p.${escapeIdentifier(principalColumn)}` : '0'} AS isPrincipal,
      ${hospitalNameColumn ? `h.${escapeIdentifier(hospitalNameColumn)}` : 'NULL'} AS nombreHospital
    FROM ${tables.plazaMedica} p
    LEFT JOIN ${tables.hospital} h
      ON ${joinCondition}
    WHERE p.${escapeIdentifier(doctorColumn)} = ?`;

  if (plazaActiveColumn) {
    sql += ` AND IFNULL(p.${escapeIdentifier(plazaActiveColumn)}, 1) = ?`;
    params.push(1);
  }

  if (hospitalActiveColumn && hospitalIdColumn) {
    sql += ` AND (
      h.${escapeIdentifier(hospitalIdColumn)} IS NULL
      OR IFNULL(h.${escapeIdentifier(hospitalActiveColumn)}, 1) = ?
    )`;
    params.push(1);
  }

  const [rows] = await resolveExecutor(executor).execute(sql, params);

  return (rows || []).map((row, index) => {
    const fallbackIndex = index + 1;

    return {
      codigoPlazaMedica: asNumber(row.plazaId),
      codigoHospitalClinica: asNumber(row.hospitalId),
      nombreHospitalClinica: asString(row.nombreHospital),
      nombrePlaza: asString(row.nombrePlaza),
      direccion: asString(row.direccionPlaza),
      telefonoClinica: asString(row.telefonoClinica),
      nombreContacto: asString(row.nombreContacto),
      puestoContacto: asString(row.puestoContacto),
      fechaNacimientoContacto: normalizeDate(row.fechaNacimientoContacto),
      telefonoMovilContacto: asString(row.telefonoMovilContacto),
      isPrincipal: asBoolean(row.isPrincipal),
      _fallbackIndex: fallbackIndex
    };
  });
}

async function listDepartments() {
  const items = await listCatalogFromTable({
    tableKey: 'geoDivisionL1',
    valueCandidates: ['CodigoGeoDivisionL1', 'CodigoDepartamento', 'Codigo', 'Id'],
    labelCandidates: ['NombreGeoDivisionL1', 'NombreDepartamento', 'Nombre', 'Descripcion']
  });

  return items;
}

async function listMunicipalities() {
  const items = await listCatalogFromTable({
    tableKey: 'geoDivisionL2',
    valueCandidates: ['CodigoGeoDivisionL2', 'CodigoMunicipio', 'Codigo', 'Id'],
    labelCandidates: ['NombreGeoDivisionL2', 'NombreMunicipio', 'Nombre', 'Descripcion'],
    parentCandidates: [
      'CodigoGeoDivisionL1',
      'CodigoDepartamento',
      'CodigoDivisionPadre',
      'CodigoPadre'
    ]
  });

  return items.map((item) => ({
    value: item.value,
    label: item.label,
    departamentoId: Number.isFinite(item.parentValue) ? item.parentValue : null
  }));
}

async function listConsultaCostRanges() {
  return listCatalogFromTable({
    tableKey: 'rangoPrecioConsulta',
    valueCandidates: [
      'CodigoRangoPrecioConsulta',
      'CodigoCostoConsulta',
      'CodigoRango',
      'Id'
    ],
    labelCandidates: [
      'NombreRangoPrecioConsulta',
      'NombreCostoConsulta',
      'NombreRango',
      'Rango',
      'Descripcion',
      'Nombre'
    ]
  });
}

async function listLineCatalog() {
  return listCatalogFromTable({
    tableKey: 'lineaProducto',
    valueCandidates: ['CodigoLineaProducto', 'CodigoLinea', 'CodLineaProducto', 'Id'],
    labelCandidates: ['NombreLineaProducto', 'NombreLinea', 'LineaProducto', 'Nombre']
  });
}

async function updateDoctorProfile({ codigoMedico, doctor }, executor) {
  const [columns, columnsMeta] = await Promise.all([
    getTableColumns('medico', executor),
    getTableColumnsMeta('medico', executor)
  ]);
  const medicoIdColumn = pickColumn(columns, ['CodigoMedico', 'CodMedico']);

  if (!medicoIdColumn) {
    throw new AppError('Directory medico primary key is not configured correctly.', 500);
  }

  const fieldMappings = [
    { key: 'primerNombre', candidates: ['PrimerNombre', 'Nombre1'] },
    { key: 'segundoNombre', candidates: ['SegundoNombre', 'Nombre2'] },
    { key: 'primerApellido', candidates: ['PrimerApellido', 'Apellido1'] },
    { key: 'segundoApellido', candidates: ['SegundoApellido', 'Apellido2'] },
    { key: 'nombrePersona', candidates: ['NombrePersona', 'NombreCompleto'] },
    {
      key: 'fechaNacimiento',
      candidates: ['FechaNacimiento', 'FechaNacimientoMedico', 'FecNacimiento']
    },
    { key: 'identificacion', candidates: ['Identificacion', 'Identidad'] },
    { key: 'numeroColegiacion', candidates: ['NoColegiacion', 'NumeroColegiacion', 'NroColegiacion'] },
    { key: 'correoPersonal', candidates: ['CorreoElectronico', 'CorreoPersonal', 'Email'] },
    { key: 'telefonoMovil', candidates: ['TelefonoMovil', 'TelefonoCelular', 'Celular'] },
    { key: 'codigoCategoria', candidates: ['CodigoCategoria', 'CodigoCategoriaMedico', 'CodCategoriaMedico'] },
    { key: 'codigoDepartamento', candidates: ['CodigoGeoDivisionL1', 'CodigoDepartamento', 'CodDepartamento'] },
    { key: 'codigoMunicipio', candidates: ['CodigoGeoDivisionL2', 'CodigoMunicipio', 'CodMunicipio'] },
    { key: 'direccion', candidates: ['Direccion', 'DireccionMedico'] },
    { key: 'pacientesSemana', candidates: ['PacientesSemana', 'PacientesPorSemana', 'CantidadPacientes'] },
    { key: 'codigoRangoPrecioConsulta', candidates: ['CodigoRangoPrecioConsulta', 'CodigoCostoConsulta'] }
  ];

  const updates = [];
  const params = [];
  const validationErrors = [];
  const requiredColumnKeys = new Set(
    columnsMeta
      .filter((column) => !column.nullable && !column.hasDefault && !column.autoIncrement)
      .map((column) => normalizeKey(column.name))
  );

  for (const mapping of fieldMappings) {
    const column = pickColumn(columns, mapping.candidates);

    if (!column) {
      continue;
    }

    const value = doctor[mapping.key] ?? null;

    if (
      requiredColumnKeys.has(normalizeKey(column)) &&
      (value === null || value === undefined)
    ) {
      validationErrors.push(`Doctor: ${column} es requerido por la base de datos.`);
    }

    updates.push(`${escapeIdentifier(column)} = ?`);
    params.push(value);
  }

  if (validationErrors.length) {
    throw new AppError(`Advertencia de campos: ${validationErrors.join(' | ')}`, 400);
  }

  if (!updates.length) {
    return false;
  }

  params.push(codigoMedico);

  const [result] = await resolveExecutor(executor).execute(
    `UPDATE ${tables.medico}
    SET ${updates.join(', ')}
    WHERE ${escapeIdentifier(medicoIdColumn)} = ?
    LIMIT 1`,
    params
  );

  return result.affectedRows > 0;
}

async function replaceDoctorSpecialties(
  { codigoMedico, especialidades = [], codigoUsuario = null, codigoPais = null },
  executor
) {
  const tableKey = 'especialidadesByMedico';
  const columns = await getTableColumns(tableKey, executor);
  const doctorColumn = pickColumn(columns, ['CodMedico', 'CodigoMedico']);
  const specialtyColumn = pickColumn(columns, ['CodigoEspecialidad', 'CodEspecialidad']);
  const principalColumn = pickColumn(columns, ['IsPrincipal', 'Principal', 'EsPrincipal']);
  const activeColumn = pickColumn(columns, ['IsActiva', 'IsActivo', 'isActive']);
  const fechaColumn = pickColumn(columns, ['Fecha']);
  const horaColumn = pickColumn(columns, ['Hora']);
  const usuarioColumn = pickColumn(columns, ['CodigoUsuario', 'CodigoUsuarioRegistra']);
  const paisColumn = pickColumn(columns, ['CodigoPais']);

  if (!doctorColumn || !specialtyColumn) {
    return;
  }

  if (activeColumn) {
    await resolveExecutor(executor).execute(
      `UPDATE ${tables[tableKey]}
      SET ${escapeIdentifier(activeColumn)} = ?
      WHERE ${escapeIdentifier(doctorColumn)} = ?`,
      [0, codigoMedico]
    );
  } else {
    await resolveExecutor(executor).execute(
      `DELETE FROM ${tables[tableKey]}
      WHERE ${escapeIdentifier(doctorColumn)} = ?`,
      [codigoMedico]
    );
  }

  if (!especialidades.length) {
    return;
  }

  const now = getCurrentDateTime();
  const insertColumns = [doctorColumn, specialtyColumn];

  if (principalColumn) {
    insertColumns.push(principalColumn);
  }

  if (activeColumn) {
    insertColumns.push(activeColumn);
  }

  if (fechaColumn) {
    insertColumns.push(fechaColumn);
  }

  if (horaColumn) {
    insertColumns.push(horaColumn);
  }

  if (usuarioColumn) {
    insertColumns.push(usuarioColumn);
  }

  if (paisColumn) {
    insertColumns.push(paisColumn);
  }

  const rowSql = `(${insertColumns.map(() => '?').join(', ')})`;
  const params = [];

  for (const item of especialidades) {
    for (const column of insertColumns) {
      if (column === doctorColumn) {
        params.push(codigoMedico);
      } else if (column === specialtyColumn) {
        params.push(item.codigoEspecialidad);
      } else if (column === principalColumn) {
        params.push(item.isPrincipal ? 1 : 0);
      } else if (column === activeColumn) {
        params.push(1);
      } else if (column === fechaColumn) {
        params.push(now.fecha);
      } else if (column === horaColumn) {
        params.push(now.hora);
      } else if (column === usuarioColumn) {
        params.push(codigoUsuario);
      } else if (column === paisColumn) {
        params.push(codigoPais);
      }
    }
  }

  const columnSql = insertColumns.map((column) => escapeIdentifier(column)).join(', ');
  const placeholders = especialidades.map(() => rowSql).join(', ');

  await resolveExecutor(executor).execute(
    `INSERT INTO ${tables[tableKey]} (${columnSql})
    VALUES ${placeholders}`,
    params
  );
}

async function replaceDoctorLines(
  { codigoMedico, lineas = [], codigoUsuario = null, codigoPais = null },
  executor
) {
  const columns = await getTableColumns('lineasProductoXMedico', executor);
  const doctorColumn = pickColumn(columns, ['CodMedico', 'CodigoMedico']);
  const lineColumn = pickColumn(columns, [
    'CodigoLineaProducto',
    'CodLineaProducto',
    'CodigoLinea'
  ]);
  const activeColumn = pickColumn(columns, ['IsActivo', 'IsActiva', 'isActive']);
  const fechaColumn = pickColumn(columns, ['Fecha']);
  const horaColumn = pickColumn(columns, ['Hora']);
  const usuarioColumn = pickColumn(columns, ['CodigoUsuario', 'CodigoUsuarioRegistra']);
  const paisColumn = pickColumn(columns, ['CodigoPais']);

  if (!doctorColumn || !lineColumn) {
    return;
  }

  if (activeColumn) {
    await resolveExecutor(executor).execute(
      `UPDATE ${tables.lineasProductoXMedico}
      SET ${escapeIdentifier(activeColumn)} = ?
      WHERE ${escapeIdentifier(doctorColumn)} = ?`,
      [0, codigoMedico]
    );
  } else {
    await resolveExecutor(executor).execute(
      `DELETE FROM ${tables.lineasProductoXMedico}
      WHERE ${escapeIdentifier(doctorColumn)} = ?`,
      [codigoMedico]
    );
  }

  if (!lineas.length) {
    return;
  }

  const now = getCurrentDateTime();
  const insertColumns = [doctorColumn, lineColumn];

  if (activeColumn) {
    insertColumns.push(activeColumn);
  }

  if (fechaColumn) {
    insertColumns.push(fechaColumn);
  }

  if (horaColumn) {
    insertColumns.push(horaColumn);
  }

  if (usuarioColumn) {
    insertColumns.push(usuarioColumn);
  }

  if (paisColumn) {
    insertColumns.push(paisColumn);
  }

  const rowSql = `(${insertColumns.map(() => '?').join(', ')})`;
  const params = [];

  for (const item of lineas) {
    for (const column of insertColumns) {
      if (column === doctorColumn) {
        params.push(codigoMedico);
      } else if (column === lineColumn) {
        params.push(item.codigoLineaProducto);
      } else if (column === activeColumn) {
        params.push(1);
      } else if (column === fechaColumn) {
        params.push(now.fecha);
      } else if (column === horaColumn) {
        params.push(now.hora);
      } else if (column === usuarioColumn) {
        params.push(codigoUsuario);
      } else if (column === paisColumn) {
        params.push(codigoPais);
      }
    }
  }

  const columnSql = insertColumns.map((column) => escapeIdentifier(column)).join(', ');
  const placeholders = lineas.map(() => rowSql).join(', ');

  await resolveExecutor(executor).execute(
    `INSERT INTO ${tables.lineasProductoXMedico} (${columnSql})
    VALUES ${placeholders}`,
    params
  );
}

async function replaceDoctorPlazas(
  { codigoMedico, plazas = [], codigoUsuario = null, codigoPais = null },
  executor
) {
  const [columns, plazaColumnsMeta] = await Promise.all([
    getTableColumns('plazaMedica', executor),
    getTableColumnsMeta('plazaMedica', executor)
  ]);
  const doctorColumn = pickColumn(columns, ['CodigoMedico', 'CodMedico']);

  if (!doctorColumn) {
    return;
  }

  const hospitalColumn = pickColumn(columns, [
    'CodigoHospitalClinica',
    'CodHospitalClinica',
    'CodigoHospital'
  ]);
  const nombrePlazaColumn = pickColumn(columns, ['NombrePlaza', 'NombrePlazaMedica', 'Nombre']);
  const direccionColumn = pickColumn(columns, ['Direccion', 'DireccionPlaza']);
  const telefonoClinicaColumn = pickColumn(columns, ['TelefonoClinica', 'Telefono']);
  const nombreContactoColumn = pickColumn(columns, ['NombreContacto']);
  const puestoContactoColumn = pickColumn(columns, ['PuestoContacto', 'CargoContacto']);
  const fechaNacimientoContactoColumn = pickColumn(columns, [
    'FechaNacimientoContacto',
    'FechaNacContacto'
  ]);
  const telefonoMovilContactoColumn = pickColumn(columns, [
    'TelefonoMovilContacto',
    'TelefonoContacto',
    'TelefonoMovil'
  ]);
  const principalColumn = pickColumn(columns, ['IsPrincipal', 'Principal', 'EsPrincipal']);
  const activeColumn = pickColumn(columns, ['IsActivo', 'IsActiva', 'isActive']);
  const fechaColumn = pickColumn(columns, ['Fecha']);
  const horaColumn = pickColumn(columns, ['Hora']);
  const usuarioColumn = pickColumn(columns, ['CodigoUsuario', 'CodigoUsuarioRegistra']);
  const paisColumn = pickColumn(columns, ['CodigoPais']);

  if (activeColumn) {
    await resolveExecutor(executor).execute(
      `UPDATE ${tables.plazaMedica}
      SET ${escapeIdentifier(activeColumn)} = ?
      WHERE ${escapeIdentifier(doctorColumn)} = ?`,
      [0, codigoMedico]
    );
  } else {
    await resolveExecutor(executor).execute(
      `DELETE FROM ${tables.plazaMedica}
      WHERE ${escapeIdentifier(doctorColumn)} = ?`,
      [codigoMedico]
    );
  }

  if (!plazas.length) {
    return;
  }

  const now = getCurrentDateTime();
  const insertColumns = [doctorColumn];

  if (hospitalColumn) {
    insertColumns.push(hospitalColumn);
  }

  if (nombrePlazaColumn) {
    insertColumns.push(nombrePlazaColumn);
  }

  if (direccionColumn) {
    insertColumns.push(direccionColumn);
  }

  if (telefonoClinicaColumn) {
    insertColumns.push(telefonoClinicaColumn);
  }

  if (nombreContactoColumn) {
    insertColumns.push(nombreContactoColumn);
  }

  if (puestoContactoColumn) {
    insertColumns.push(puestoContactoColumn);
  }

  if (fechaNacimientoContactoColumn) {
    insertColumns.push(fechaNacimientoContactoColumn);
  }

  if (telefonoMovilContactoColumn) {
    insertColumns.push(telefonoMovilContactoColumn);
  }

  if (principalColumn) {
    insertColumns.push(principalColumn);
  }

  if (activeColumn) {
    insertColumns.push(activeColumn);
  }

  if (fechaColumn) {
    insertColumns.push(fechaColumn);
  }

  if (horaColumn) {
    insertColumns.push(horaColumn);
  }

  if (usuarioColumn) {
    insertColumns.push(usuarioColumn);
  }

  if (paisColumn) {
    insertColumns.push(paisColumn);
  }

  const requiredColumns = plazaColumnsMeta
    .filter((column) => !column.nullable && !column.hasDefault && !column.autoIncrement)
    .map((column) => column.name);
  const insertColumnKeys = new Set(insertColumns.map((column) => normalizeKey(column)));
  const unmappedRequiredColumns = requiredColumns.filter(
    (column) => !insertColumnKeys.has(normalizeKey(column))
  );

  if (unmappedRequiredColumns.length) {
    const issues = unmappedRequiredColumns.map(
      (column) => `Columna requerida sin mapeo: ${column}.`
    );

    throw new AppError(`Advertencia de campos: ${issues.join(' | ')}`, 400);
  }

  const requiredColumnKeys = new Set(requiredColumns.map((column) => normalizeKey(column)));
  const rowSql = `(${insertColumns.map(() => '?').join(', ')})`;
  const params = [];
  const validationErrors = [];

  const resolveColumnValue = (column, item) => {
    if (column === doctorColumn) {
      return codigoMedico;
    }

    if (column === hospitalColumn) {
      return item.codigoHospitalClinica ?? null;
    }

    if (column === nombrePlazaColumn) {
      return item.nombrePlaza ?? '';
    }

    if (column === direccionColumn) {
      return item.direccion ?? '';
    }

    if (column === telefonoClinicaColumn) {
      return item.telefonoClinica ?? '';
    }

    if (column === nombreContactoColumn) {
      return item.nombreContacto ?? '';
    }

    if (column === puestoContactoColumn) {
      return item.puestoContacto ?? '';
    }

    if (column === fechaNacimientoContactoColumn) {
      return item.fechaNacimientoContacto || null;
    }

    if (column === telefonoMovilContactoColumn) {
      return item.telefonoMovilContacto ?? '';
    }

    if (column === principalColumn) {
      return item.isPrincipal ? 1 : 0;
    }

    if (column === activeColumn) {
      return 1;
    }

    if (column === fechaColumn) {
      return now.fecha;
    }

    if (column === horaColumn) {
      return now.hora;
    }

    if (column === usuarioColumn) {
      return codigoUsuario;
    }

    if (column === paisColumn) {
      return codigoPais;
    }

    return null;
  };

  for (let index = 0; index < plazas.length; index += 1) {
    const item = plazas[index];

    for (const column of insertColumns) {
      const value = resolveColumnValue(column, item);

      if (
        requiredColumnKeys.has(normalizeKey(column)) &&
        (value === null || value === undefined)
      ) {
        validationErrors.push(
          `Plaza ${index + 1}: ${column} es requerido por la base de datos.`
        );
      }

      params.push(value);
    }
  }

  if (validationErrors.length) {
    throw new AppError(`Advertencia de campos: ${validationErrors.join(' | ')}`, 400);
  }

  const columnSql = insertColumns.map((column) => escapeIdentifier(column)).join(', ');
  const placeholders = plazas.map(() => rowSql).join(', ');

  await resolveExecutor(executor).execute(
    `INSERT INTO ${tables.plazaMedica} (${columnSql})
    VALUES ${placeholders}`,
    params
  );
}

module.exports = {
  findVisitadorByCodPersonas,
  findVisitadorByCodigoVisitador,
  countAssignedDoctors,
  countAssignedBranches,
  listHospitals,
  listSpecialties,
  listCategories,
  listAssignedBranchCatalog,
  listAssignedDoctors,
  listDoctorVisitHistory,
  listBranchVisitHistory,
  listAssignedBranches,
  findSucursalInfoByCountryAndCode,
  findPersonaByCodeFromTable,
  findDoctorByAssignment,
  listDoctorSpecialties,
  listDoctorLines,
  listDoctorPlazas,
  listDepartments,
  listMunicipalities,
  listConsultaCostRanges,
  listLineCatalog,
  updateDoctorProfile,
  replaceDoctorSpecialties,
  replaceDoctorLines,
  replaceDoctorPlazas
};
