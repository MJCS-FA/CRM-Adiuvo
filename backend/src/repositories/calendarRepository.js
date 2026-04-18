const { appConfig } = require('../config/app');
const { getPool } = require('../config/database');
const { AppError } = require('../utils/appError');

function quoteIdentifier(value, label) {
  if (!/^[A-Za-z0-9_]+$/.test(value || '')) {
    throw new AppError(`Invalid identifier for ${label}.`, 500);
  }

  return `\`${value}\``;
}

const calendarConfig = appConfig.calendar;
const dbName = quoteIdentifier(calendarConfig.dbName, 'CALENDAR_DB_NAME');
const sucursalDbName = quoteIdentifier(
  calendarConfig.sucursalCatalogDbName,
  'CALENDAR_SUCURSAL_DB_NAME'
);

const tables = {
  visitaMedica: `${dbName}.${quoteIdentifier(
    calendarConfig.visitaMedicaTable,
    'CALENDAR_VISITA_MEDICA_TABLE'
  )}`,
  tipoVisita: `${dbName}.${quoteIdentifier(
    calendarConfig.tipoVisitaTable,
    'CALENDAR_TIPO_VISITA_TABLE'
  )}`,
  tipoCanal: `${dbName}.${quoteIdentifier(
    calendarConfig.tipoCanalTable,
    'CALENDAR_TIPO_CANAL_TABLE'
  )}`,
  estado: `${dbName}.${quoteIdentifier(
    calendarConfig.estadoTable,
    'CALENDAR_ESTADO_TABLE'
  )}`,
  medico: `${dbName}.${quoteIdentifier(
    calendarConfig.medicoTable,
    'CALENDAR_MEDICO_TABLE'
  )}`,
  sucursal: `${sucursalDbName}.${quoteIdentifier(
    calendarConfig.sucursalCatalogTable,
    'CALENDAR_SUCURSAL_TABLE'
  )}`
};

const columns = {
  sucursalId: quoteIdentifier(
    calendarConfig.sucursalCatalogIdColumn,
    'CALENDAR_SUCURSAL_ID_COLUMN'
  ),
  sucursalName: quoteIdentifier(
    calendarConfig.sucursalCatalogNameColumn,
    'CALENDAR_SUCURSAL_NAME_COLUMN'
  ),
  sucursalCode: quoteIdentifier(
    calendarConfig.sucursalCatalogCodeColumn,
    'CALENDAR_SUCURSAL_CODE_COLUMN'
  ),
  sucursalIsActive: quoteIdentifier(
    calendarConfig.sucursalCatalogActiveColumn,
    'CALENDAR_SUCURSAL_ACTIVE_COLUMN'
  )
};
const tableColumnsCache = new Map();

function escapeColumn(columnName) {
  return quoteIdentifier(columnName, `CALENDAR_COLUMN_${columnName}`);
}

function pickAvailableColumn(availableColumns, candidates = []) {
  for (const candidate of candidates) {
    if (availableColumns.has(candidate)) {
      return candidate;
    }
  }

  return null;
}

async function getTableColumns(tableSql) {
  if (tableColumnsCache.has(tableSql)) {
    return tableColumnsCache.get(tableSql);
  }

  const [rows] = await getPool().execute(`SHOW COLUMNS FROM ${tableSql}`);
  const parsed = new Set(
    (rows || [])
      .map((item) => String(item.Field || '').trim())
      .filter(Boolean)
  );

  tableColumnsCache.set(tableSql, parsed);
  return parsed;
}

function doctorNameSql(alias = 'm') {
  return `COALESCE(
    NULLIF(${alias}.NombrePersona, ''),
    TRIM(CONCAT_WS(' ', ${alias}.PrimerNombre, ${alias}.SegundoNombre, ${alias}.PrimerApellido, ${alias}.SegundoApellido))
  )`;
}

async function listVisitTypes() {
  const [rows] = await getPool().execute(
    `SELECT
      CodigoEntidad AS value,
      NombreEntidad AS label
    FROM ${tables.tipoVisita}
    WHERE IFNULL(IsActivo, 1) = 1
    ORDER BY Orden ASC, NombreEntidad ASC`
  );

  return rows;
}

async function listVisitChannels() {
  const [rows] = await getPool().execute(
    `SELECT
      CodigoTipoCanal AS value,
      TipoCanal AS label
    FROM ${tables.tipoCanal}
    WHERE IFNULL(IsActivo, 1) = 1
    ORDER BY TipoCanal ASC`
  );

  return rows;
}

async function listCancellationReasons() {
  const candidateTables = [
    calendarConfig.motivoCancelacionTable,
    'tblMotivoCancelacionVisita',
    'tblMotivosCancelacionVisita',
    'tblMotivoCancelacion'
  ]
    .map((name) => String(name || '').trim())
    .filter(Boolean);

  const uniqueCandidates = [...new Set(candidateTables)];

  for (const tableName of uniqueCandidates) {
    let tableSql = '';

    try {
      tableSql = `${dbName}.${quoteIdentifier(
        tableName,
        `CALENDAR_MOTIVO_CANCELACION_TABLE_${tableName}`
      )}`;
      const availableColumns = await getTableColumns(tableSql);
      const idColumn = pickAvailableColumn(availableColumns, [
        'CodigoMotivoCancelacion',
        'CodigoMotivo',
        'CodigoMotivoVisita',
        'Id',
        'ID'
      ]);
      const labelColumn = pickAvailableColumn(availableColumns, [
        'MotivoCancelacion',
        'NombreMotivoCancelacion',
        'Nombre',
        'Descripcion',
        'Motivo'
      ]);

      if (!idColumn || !labelColumn) {
        continue;
      }

      const activeColumn = pickAvailableColumn(availableColumns, [
        'IsActivo',
        'IsActiva',
        'IsActive',
        'isActivo'
      ]);

      const [rows] = await getPool().execute(
        `SELECT
          ${escapeColumn(idColumn)} AS value,
          ${escapeColumn(labelColumn)} AS label
        FROM ${tableSql}
        ${activeColumn ? `WHERE IFNULL(${escapeColumn(activeColumn)}, 1) = 1` : ''}
        ORDER BY ${escapeColumn(labelColumn)} ASC`
      );

      const mapped = (rows || [])
        .map((item) => ({
          value: Number(item.value),
          label: String(item.label || '').trim()
        }))
        .filter((item) => Number.isFinite(item.value) && item.value > 0 && item.label);

      if (mapped.length) {
        return mapped;
      }
    } catch (error) {
      const errorCode = String(error?.code || '');

      if (
        errorCode === 'ER_NO_SUCH_TABLE' ||
        errorCode === 'ER_BAD_DB_ERROR' ||
        errorCode === 'ER_NO_SUCH_FIELD'
      ) {
        continue;
      }

      throw error;
    }
  }

  return [];
}

async function resolveProgrammedStatusCode(defaultCode) {
  const [rows] = await getPool().execute(
    `SELECT CodigoEstado AS value
    FROM ${tables.estado}
    WHERE IFNULL(IsActivo, 1) = 1
      AND LOWER(Estado) LIKE 'programad%'
    ORDER BY Orden ASC, CodigoEstado ASC
    LIMIT 1`
  );

  if (rows[0]?.value) {
    return Number(rows[0].value);
  }

  return Number(defaultCode || 1);
}

async function listVisitsByMonth({ codigoVisitador, startDate, endDate }) {
  const [rows] = await getPool().execute(
    `SELECT
      vm.CodigoVisitaMedica AS codigoVisitaMedica,
      vm.CodigoVisitador AS codigoVisitador,
      vm.CodigoMedico AS codigoMedico,
      vm.CodigoSucursal AS codigoSucursal,
      ${doctorNameSql('m')} AS nombreMedico,
      NULLIF(sc.${columns.sucursalCode}, '') AS codigoInternoSucursal,
      COALESCE(
        NULLIF(sc.${columns.sucursalName}, ''),
        CASE
          WHEN IFNULL(vm.CodigoSucursal, 0) > 0
          THEN CONCAT('Sucursal ', vm.CodigoSucursal)
          ELSE ''
        END
      ) AS nombreSucursal,
      vm.CodigoEntidad AS codigoTipoVisita,
      tv.NombreEntidad AS tipoVisita,
      vm.CodigoTipoCanal AS codigoTipoCanal,
      tc.TipoCanal AS canalVisita,
      vm.CodigoEstado AS codigoEstado,
      e.Estado AS estado,
      vm.FechaProgramada AS fechaProgramada,
      vm.HoraProgramada AS horaProgramada,
      vm.Comentarios AS comentarios
    FROM ${tables.visitaMedica} vm
    LEFT JOIN ${tables.medico} m
      ON m.CodigoMedico = vm.CodigoMedico
    LEFT JOIN ${tables.sucursal} sc
      ON sc.${columns.sucursalId} = vm.CodigoSucursal
      AND IFNULL(sc.${columns.sucursalIsActive}, 1) = 1
    LEFT JOIN ${tables.tipoVisita} tv
      ON tv.CodigoEntidad = vm.CodigoEntidad
    LEFT JOIN ${tables.tipoCanal} tc
      ON tc.CodigoTipoCanal = vm.CodigoTipoCanal
    LEFT JOIN ${tables.estado} e
      ON e.CodigoEstado = vm.CodigoEstado
    WHERE vm.CodigoVisitador = ?
      AND IFNULL(vm.IsActiva, 1) = 1
      AND vm.FechaProgramada BETWEEN ? AND ?
    ORDER BY vm.FechaProgramada ASC, vm.HoraProgramada ASC, vm.CodigoVisitaMedica ASC`,
    [codigoVisitador, startDate, endDate]
  );

  return rows;
}

async function createVisit(payload) {
  const [result] = await getPool().execute(
    `INSERT INTO ${tables.visitaMedica}
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
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      payload.codigoPais,
      payload.codigoEntidad,
      payload.isMedico,
      payload.codigoMedico,
      payload.codigoSucursal,
      payload.codigoLocal,
      payload.codigoCicloVisita,
      payload.fecha,
      payload.hora,
      payload.codigoUsuario,
      payload.fechaProgramada,
      payload.horaProgramada,
      payload.codigoEstado,
      payload.codigoVisitador,
      payload.codigoTipoCanal,
      payload.nombreVisita,
      payload.comentarios,
      payload.isActiva,
      payload.isProgramada
    ]
  );

  return result.insertId;
}

async function findVisitByIdForVisitador({ codigoVisitaMedica, codigoVisitador }) {
  const [rows] = await getPool().execute(
    `SELECT
      vm.CodigoVisitaMedica AS codigoVisitaMedica,
      vm.CodigoVisitador AS codigoVisitador,
      vm.CodigoMedico AS codigoMedico,
      vm.CodigoSucursal AS codigoSucursal,
      ${doctorNameSql('m')} AS nombreMedico,
      NULLIF(sc.${columns.sucursalCode}, '') AS codigoInternoSucursal,
      COALESCE(
        NULLIF(sc.${columns.sucursalName}, ''),
        CASE
          WHEN IFNULL(vm.CodigoSucursal, 0) > 0
          THEN CONCAT('Sucursal ', vm.CodigoSucursal)
          ELSE ''
        END
      ) AS nombreSucursal,
      vm.CodigoEntidad AS codigoTipoVisita,
      tv.NombreEntidad AS tipoVisita,
      vm.CodigoTipoCanal AS codigoTipoCanal,
      tc.TipoCanal AS canalVisita,
      vm.CodigoEstado AS codigoEstado,
      e.Estado AS estado,
      vm.FechaProgramada AS fechaProgramada,
      vm.HoraProgramada AS horaProgramada,
      vm.Comentarios AS comentarios
    FROM ${tables.visitaMedica} vm
    LEFT JOIN ${tables.medico} m
      ON m.CodigoMedico = vm.CodigoMedico
    LEFT JOIN ${tables.sucursal} sc
      ON sc.${columns.sucursalId} = vm.CodigoSucursal
      AND IFNULL(sc.${columns.sucursalIsActive}, 1) = 1
    LEFT JOIN ${tables.tipoVisita} tv
      ON tv.CodigoEntidad = vm.CodigoEntidad
    LEFT JOIN ${tables.tipoCanal} tc
      ON tc.CodigoTipoCanal = vm.CodigoTipoCanal
    LEFT JOIN ${tables.estado} e
      ON e.CodigoEstado = vm.CodigoEstado
    WHERE vm.CodigoVisitaMedica = ?
      AND vm.CodigoVisitador = ?
      AND IFNULL(vm.IsActiva, 1) = 1
    LIMIT 1`,
    [codigoVisitaMedica, codigoVisitador]
  );

  return rows[0] || null;
}

async function hasVisitConflict({
  codigoVisitador,
  fechaProgramada,
  horaProgramada,
  excludeCodigoVisitaMedica = null
}) {
  const [rows] = await getPool().execute(
    `SELECT
      vm.CodigoVisitaMedica AS codigoVisitaMedica
    FROM ${tables.visitaMedica} vm
    WHERE vm.CodigoVisitador = ?
      AND vm.FechaProgramada = ?
      AND vm.HoraProgramada = ?
      AND IFNULL(vm.IsActiva, 1) = 1
      AND IFNULL(vm.CodigoEstado, 0) <> 3
      AND (? IS NULL OR vm.CodigoVisitaMedica <> ?)
    LIMIT 1`,
    [
      codigoVisitador,
      fechaProgramada,
      horaProgramada,
      excludeCodigoVisitaMedica,
      excludeCodigoVisitaMedica
    ]
  );

  return Boolean(rows[0]?.codigoVisitaMedica);
}

async function updateVisitByDecision({
  codigoVisitaMedica,
  codigoVisitador,
  codigoMotivoCancelacion,
  observaciones,
  fechaCancelacion,
  horaCancelacion,
  codigoEstado,
  fechaProgramada = null,
  horaProgramada = null,
  isReagendar = false
}) {
  const availableColumns = await getTableColumns(tables.visitaMedica);
  const visitIdColumn = pickAvailableColumn(availableColumns, ['CodigoVisitaMedica']);
  const visitadorColumn = pickAvailableColumn(availableColumns, ['CodigoVisitador']);
  const activeColumn = pickAvailableColumn(availableColumns, [
    'IsActiva',
    'IsActivo',
    'IsActive'
  ]);
  const estadoColumn = pickAvailableColumn(availableColumns, ['CodigoEstado', 'CodEstado']);
  const motivoColumn = pickAvailableColumn(availableColumns, [
    'CodigoMotivoCancelacion',
    'CodigoMotivoCancelacionVisita',
    'CodigoMotivo'
  ]);
  const observacionColumn = pickAvailableColumn(availableColumns, [
    'ComentacionCancelacion',
    'ComentarioCancelacion',
    'ComentariosCancelacion',
    'ObservacionCancelacion',
    'ObservacionesCancelacion'
  ]);
  const fechaCancelColumn = pickAvailableColumn(availableColumns, ['FechaCancelacion']);
  const horaCancelColumn = pickAvailableColumn(availableColumns, ['HoraCancelacion']);
  const isModifiedColumn = pickAvailableColumn(availableColumns, ['IsModified', 'isModified']);
  const fechaProgramadaColumn = pickAvailableColumn(availableColumns, ['FechaProgramada']);
  const horaProgramadaColumn = pickAvailableColumn(availableColumns, ['HoraProgramada']);

  if (!visitIdColumn || !visitadorColumn || !estadoColumn) {
    throw new AppError('Visit table is missing required columns to update status.', 500);
  }

  const assignments = [];
  const params = [];

  assignments.push(`${escapeColumn(estadoColumn)} = ?`);
  params.push(codigoEstado);

  if (motivoColumn) {
    assignments.push(`${escapeColumn(motivoColumn)} = ?`);
    params.push(codigoMotivoCancelacion);
  }

  if (observacionColumn) {
    assignments.push(`${escapeColumn(observacionColumn)} = ?`);
    params.push(observaciones);
  }

  if (fechaCancelColumn) {
    assignments.push(`${escapeColumn(fechaCancelColumn)} = ?`);
    params.push(fechaCancelacion);
  }

  if (horaCancelColumn) {
    assignments.push(`${escapeColumn(horaCancelColumn)} = ?`);
    params.push(horaCancelacion);
  }

  if (isModifiedColumn) {
    assignments.push(`${escapeColumn(isModifiedColumn)} = ?`);
    params.push(1);
  }

  if (isReagendar) {
    if (!fechaProgramadaColumn || !horaProgramadaColumn) {
      throw new AppError('Visit table is missing scheduled date/time columns.', 500);
    }

    assignments.push(`${escapeColumn(fechaProgramadaColumn)} = ?`);
    params.push(fechaProgramada);
    assignments.push(`${escapeColumn(horaProgramadaColumn)} = ?`);
    params.push(horaProgramada);
  }

  const whereParts = [
    `${escapeColumn(visitIdColumn)} = ?`,
    `${escapeColumn(visitadorColumn)} = ?`
  ];

  params.push(codigoVisitaMedica, codigoVisitador);

  if (activeColumn) {
    whereParts.push(`IFNULL(${escapeColumn(activeColumn)}, 1) = 1`);
  }

  const [result] = await getPool().execute(
    `UPDATE ${tables.visitaMedica}
    SET ${assignments.join(', ')}
    WHERE ${whereParts.join(' AND ')}
    LIMIT 1`,
    params
  );

  return Number(result.affectedRows || 0);
}

async function findVisitById(codigoVisitaMedica) {
  const [rows] = await getPool().execute(
    `SELECT
      vm.CodigoVisitaMedica AS codigoVisitaMedica,
      vm.CodigoVisitador AS codigoVisitador,
      vm.CodigoMedico AS codigoMedico,
      vm.CodigoSucursal AS codigoSucursal,
      ${doctorNameSql('m')} AS nombreMedico,
      NULLIF(sc.${columns.sucursalCode}, '') AS codigoInternoSucursal,
      COALESCE(
        NULLIF(sc.${columns.sucursalName}, ''),
        CASE
          WHEN IFNULL(vm.CodigoSucursal, 0) > 0
          THEN CONCAT('Sucursal ', vm.CodigoSucursal)
          ELSE ''
        END
      ) AS nombreSucursal,
      vm.CodigoEntidad AS codigoTipoVisita,
      tv.NombreEntidad AS tipoVisita,
      vm.CodigoTipoCanal AS codigoTipoCanal,
      tc.TipoCanal AS canalVisita,
      vm.CodigoEstado AS codigoEstado,
      e.Estado AS estado,
      vm.FechaProgramada AS fechaProgramada,
      vm.HoraProgramada AS horaProgramada,
      vm.Comentarios AS comentarios
    FROM ${tables.visitaMedica} vm
    LEFT JOIN ${tables.medico} m
      ON m.CodigoMedico = vm.CodigoMedico
    LEFT JOIN ${tables.sucursal} sc
      ON sc.${columns.sucursalId} = vm.CodigoSucursal
      AND IFNULL(sc.${columns.sucursalIsActive}, 1) = 1
    LEFT JOIN ${tables.tipoVisita} tv
      ON tv.CodigoEntidad = vm.CodigoEntidad
    LEFT JOIN ${tables.tipoCanal} tc
      ON tc.CodigoTipoCanal = vm.CodigoTipoCanal
    LEFT JOIN ${tables.estado} e
      ON e.CodigoEstado = vm.CodigoEstado
    WHERE vm.CodigoVisitaMedica = ?
    LIMIT 1`,
    [codigoVisitaMedica]
  );

  return rows[0] || null;
}

module.exports = {
  listVisitTypes,
  listVisitChannels,
  listCancellationReasons,
  resolveProgrammedStatusCode,
  listVisitsByMonth,
  createVisit,
  findVisitByIdForVisitador,
  hasVisitConflict,
  updateVisitByDecision,
  findVisitById
};
