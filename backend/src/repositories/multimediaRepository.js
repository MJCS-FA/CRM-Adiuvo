const { appConfig } = require('../config/app');
const { getPool } = require('../config/database');
const { AppError } = require('../utils/appError');

const tableColumnsCache = new Map();
const mappingCache = new Map();

function quoteIdentifier(value, label) {
  if (!/^[A-Za-z0-9_]+$/.test(value || '')) {
    throw new AppError(`Invalid identifier for ${label}.`, 500);
  }

  return `\`${value}\``;
}

function normalizeKey(value) {
  return String(value || '').trim().toLowerCase();
}

function uniqueCandidates(candidates = []) {
  const seen = new Set();
  const result = [];

  for (const candidate of candidates) {
    const normalized = String(candidate || '').trim();
    const key = normalizeKey(normalized);

    if (!key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(normalized);
  }

  return result;
}

function pickColumn(columns = [], candidates = []) {
  const byKey = new Map();

  for (const column of columns) {
    byKey.set(normalizeKey(column), column);
  }

  for (const candidate of uniqueCandidates(candidates)) {
    const found = byKey.get(normalizeKey(candidate));
    if (found) {
      return found;
    }
  }

  return null;
}

function selectColumnOrFallback(alias, column, outputAlias, fallbackSql = "''") {
  if (!column) {
    return `${fallbackSql} AS ${quoteIdentifier(outputAlias, `MULTIMEDIA_OUTPUT_${outputAlias}`)}`;
  }

  return `${alias}.${quoteIdentifier(column, `MULTIMEDIA_COLUMN_${column}`)} AS ${quoteIdentifier(
    outputAlias,
    `MULTIMEDIA_OUTPUT_${outputAlias}`
  )}`;
}

function buildTableRef(dbName, tableName, dbLabel, tableLabel) {
  return `${quoteIdentifier(dbName, dbLabel)}.${quoteIdentifier(tableName, tableLabel)}`;
}

function resolveDatabaseCandidates() {
  const config = appConfig.multimedia || {};
  const envFallbacks = String(process.env.MULTIMEDIA_DB_FALLBACKS || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  return uniqueCandidates([
    config.dbName,
    process.env.MULTIMEDIA_DB_NAME,
    appConfig.directory?.dbName,
    process.env.DIRECTORY_DB_NAME,
    appConfig.calendar?.dbName,
    process.env.CALENDAR_DB_NAME,
    appConfig.home?.dbName,
    process.env.HOME_DB_NAME,
    process.env.CORP_DB_NAME,
    appConfig.directory?.sucursalCatalogDbName,
    process.env.DIRECTORY_SUCURSAL_CATALOG_DB_NAME,
    'dbVisitasMedicas',
    ...envFallbacks
  ]);
}

function resolveTableCandidates(primaryName, defaultName) {
  return uniqueCandidates([primaryName, defaultName]);
}

function isMissingTableError(error) {
  const code = String(error?.code || '').toUpperCase();
  return code === 'ER_NO_SUCH_TABLE' || code === 'ER_BAD_DB_ERROR' || code === 'ER_BAD_TABLE_ERROR';
}

function isStatementArgumentsError(error) {
  const code = String(error?.code || '').toUpperCase();
  const message = String(error?.message || '').toLowerCase();

  return code === 'ER_WRONG_ARGUMENTS' || message.includes('incorrect arguments to mysqld_stmt_execute');
}

async function runSql(executor, sql, params = []) {
  try {
    return await executor.execute(sql, params);
  } catch (error) {
    if (!isStatementArgumentsError(error)) {
      throw error;
    }

    return executor.query(sql, params);
  }
}

async function getColumnsForTable(executor, dbName, tableName) {
  const cacheKey = `${normalizeKey(dbName)}.${normalizeKey(tableName)}`;

  if (tableColumnsCache.has(cacheKey)) {
    return tableColumnsCache.get(cacheKey);
  }

  const tableSql = buildTableRef(
    dbName,
    tableName,
    'MULTIMEDIA_DISCOVERY_DB_NAME',
    'MULTIMEDIA_DISCOVERY_TABLE'
  );

  try {
    const [rows] = await runSql(executor, `SHOW COLUMNS FROM ${tableSql}`);
    const columns = (rows || [])
      .map((row) => String(row.Field || '').trim())
      .filter(Boolean);
    tableColumnsCache.set(cacheKey, columns);
    return columns;
  } catch (error) {
    if (isMissingTableError(error)) {
      const columns = [];
      tableColumnsCache.set(cacheKey, columns);
      return columns;
    }

    throw error;
  }
}

function requiredColumnCandidateSets() {
  const config = appConfig.multimedia || {};

  return {
    multimedia: {
      id: [
        config.multimediaIdColumn,
        'CodigoMultimedia',
        'Codigo_Multimedia',
        'idMultimedia',
        'IdMultimedia'
      ],
      nombre: [
        config.multimediaNameColumn,
        'NombreMultimedia',
        'Nombre',
        'Titulo'
      ],
      codigoTipo: [
        config.multimediaTypeColumn,
        'CodigoTipoMultimedia',
        'Codigo_TipoMultimedia',
        'IdTipoMultimedia'
      ]
    },
    tipo: {
      id: [
        config.tipoMultimediaIdColumn,
        'CodigoTipoMultimedia',
        'Codigo_TipoMultimedia',
        'IdTipoMultimedia'
      ],
      nombre: [
        config.tipoMultimediaNameColumn,
        'TipoMultimedia',
        'NombreTipoMultimedia',
        'Nombre'
      ]
    },
    portada: {
      codigoMultimedia: [
        config.portadaMultimediaIdColumn,
        'CodigoMultimedia',
        'Codigo_Multimedia',
        'IdMultimedia'
      ],
      s3KeyPortada: [
        config.portadaS3KeyColumn,
        'S3KeyPortada',
        'S3Key',
        'S3KeyArchivo'
      ]
    }
  };
}

async function resolveFirstMatchingTable(
  executor,
  tableCandidates,
  databaseCandidates,
  requiredColumns = {}
) {
  const tried = [];

  for (const dbName of databaseCandidates) {
    for (const tableName of tableCandidates) {
      const columns = await getColumnsForTable(executor, dbName, tableName);
      tried.push(`${dbName}.${tableName}`);

      if (!columns.length) {
        continue;
      }

      let allRequiredPresent = true;

      for (const candidates of Object.values(requiredColumns)) {
        const found = pickColumn(columns, candidates);
        if (!found) {
          allRequiredPresent = false;
          break;
        }
      }

      if (!allRequiredPresent) {
        continue;
      }

      return {
        dbName,
        tableName,
        columns,
        tried
      };
    }
  }

  return {
    dbName: databaseCandidates[0] || '',
    tableName: tableCandidates[0] || '',
    columns: [],
    tried
  };
}

function resolveColumnMappings(foundColumnsByTable) {
  const config = appConfig.multimedia || {};
  const required = requiredColumnCandidateSets();

  const multimediaColumns = foundColumnsByTable.multimedia.columns || [];
  const tipoColumns = foundColumnsByTable.tipo.columns || [];
  const portadaColumns = foundColumnsByTable.portada?.columns || [];

  return {
    multimedia: {
      id: pickColumn(multimediaColumns, required.multimedia.id),
      nombre: pickColumn(multimediaColumns, required.multimedia.nombre),
      descripcion: pickColumn(multimediaColumns, [
        config.multimediaDescriptionColumn,
        'Descripcion',
        'Descripción',
        'Detalle'
      ]),
      nombreArchivo: pickColumn(multimediaColumns, [
        config.multimediaFileNameColumn,
        'NombreArchivo',
        'Archivo',
        'FileName'
      ]),
      codigoTipo: pickColumn(multimediaColumns, required.multimedia.codigoTipo),
      isActive: pickColumn(multimediaColumns, [
        config.multimediaIsActiveColumn,
        'IsActive',
        'isActive',
        'IsActivo',
        'isActivo',
        'Activo'
      ]),
      s3KeyArchivo: pickColumn(multimediaColumns, [
        config.multimediaS3KeyColumn,
        'S3KeyArchivo',
        'S3Key',
        'S3KeyMultimedia'
      ]),
      s3KeyPortada: pickColumn(multimediaColumns, [
        config.multimediaPortadaS3KeyColumn,
        config.portadaS3KeyColumn,
        'S3KeyPortada',
        'S3Key',
        'S3KeyArchivo',
        'S3KeyMultimedia'
      ]),
      mimeType: pickColumn(multimediaColumns, [
        config.multimediaMimeTypeColumn,
        'MimeType',
        'ContentType',
        'TipoMime'
      ]),
      urlArchivo: pickColumn(multimediaColumns, [
        config.multimediaUrlColumn,
        'UrlArchivo',
        'URLArchivo',
        'Link',
        'Url'
      ])
    },
    tipo: {
      id: pickColumn(tipoColumns, required.tipo.id),
      nombre: pickColumn(tipoColumns, required.tipo.nombre),
      isActive: pickColumn(tipoColumns, [
        config.tipoMultimediaIsActiveColumn,
        'IsActive',
        'isActive',
        'IsActivo',
        'isActivo',
        'Activo'
      ])
    },
    portada: {
      codigoMultimedia: pickColumn(portadaColumns, required.portada.codigoMultimedia),
      s3KeyPortada: pickColumn(portadaColumns, required.portada.s3KeyPortada),
      isActive: pickColumn(portadaColumns, [
        config.portadaIsActiveColumn,
        'IsActive',
        'isActive',
        'IsActivo',
        'isActivo',
        'Activo'
      ])
    }
  };
}

async function resolveMappings(executor = getPool()) {
  const cacheKey = 'multimedia:column-mappings:v3';

  if (mappingCache.has(cacheKey)) {
    return mappingCache.get(cacheKey);
  }

  const config = appConfig.multimedia || {};
  const dbCandidates = resolveDatabaseCandidates();
  const tableCandidates = {
    multimedia: resolveTableCandidates(config.multimediaTable, 'tblMultimedia'),
    tipo: resolveTableCandidates(config.tipoMultimediaTable, 'tblTipoMultimedia')
  };
  const required = requiredColumnCandidateSets();

  const multimediaFound = await resolveFirstMatchingTable(
    executor,
    tableCandidates.multimedia,
    dbCandidates,
    {
      id: required.multimedia.id,
      nombre: required.multimedia.nombre,
      codigoTipo: required.multimedia.codigoTipo
    }
  );

  if (!multimediaFound.columns.length) {
    throw new AppError(
      'Multimedia table mapping is incomplete. Verify MULTIMEDIA_* column configuration.',
      500,
      {
        table: tableCandidates.multimedia[0] || 'tblMultimedia',
        columns: [],
        tried: multimediaFound.tried,
        databaseCandidates: dbCandidates
      }
    );
  }

  const typeDbCandidates = uniqueCandidates([multimediaFound.dbName, ...dbCandidates]);
  const tipoFound = await resolveFirstMatchingTable(
    executor,
    tableCandidates.tipo,
    typeDbCandidates,
    {
      id: required.tipo.id,
      nombre: required.tipo.nombre
    }
  );

  if (!tipoFound.columns.length) {
    throw new AppError(
      'TipoMultimedia table mapping is incomplete. Verify MULTIMEDIA_TIPO_* configuration.',
      500,
      {
        table: tableCandidates.tipo[0] || 'tblTipoMultimedia',
        columns: [],
        tried: tipoFound.tried,
        databaseCandidates: typeDbCandidates
      }
    );
  }

  const columns = resolveColumnMappings({
    multimedia: multimediaFound,
    tipo: tipoFound
  });

  const mappings = {
    dbName: multimediaFound.dbName,
    tables: {
      multimedia: buildTableRef(
        multimediaFound.dbName,
        multimediaFound.tableName,
        'MULTIMEDIA_DB_NAME',
        'MULTIMEDIA_TABLE'
      ),
      tipo: buildTableRef(
        tipoFound.dbName,
        tipoFound.tableName,
        'MULTIMEDIA_DB_NAME',
        'MULTIMEDIA_TIPO_TABLE'
      ),
      portada: null
    },
    columns,
    discovery: {
      multimedia: multimediaFound,
      tipo: tipoFound,
      portada: null
    }
  };

  mappingCache.set(cacheKey, mappings);
  return mappings;
}

function normalizeLimit(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return Number(appConfig.multimedia?.defaultSearchLimit || 200);
  }

  return Math.min(Math.trunc(parsed), 500);
}

function escapeLike(value) {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_');
}

async function listMultimediaTypes() {
  const executor = getPool();
  const mappings = await resolveMappings(executor);
  const { tables, columns } = mappings;

  const selectId = `t.${quoteIdentifier(
    columns.tipo.id,
    'MULTIMEDIA_TIPO_ID_COLUMN'
  )} AS ${quoteIdentifier('codigoTipoMultimedia', 'MULTIMEDIA_OUT_TIPO_ID')}`;
  const selectName = `t.${quoteIdentifier(
    columns.tipo.nombre,
    'MULTIMEDIA_TIPO_NAME_COLUMN'
  )} AS ${quoteIdentifier('tipoMultimedia', 'MULTIMEDIA_OUT_TIPO_NAME')}`;

  const where = [];
  if (columns.tipo.isActive) {
    where.push(
      `t.${quoteIdentifier(columns.tipo.isActive, 'MULTIMEDIA_TIPO_IS_ACTIVE_COLUMN')} = 1`
    );
  }

  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const [rows] = await runSql(
    executor,
    `
      SELECT
        ${selectId},
        ${selectName}
      FROM ${tables.tipo} t
      ${whereClause}
      ORDER BY t.${quoteIdentifier(columns.tipo.nombre, 'MULTIMEDIA_TIPO_NAME_COLUMN')} ASC
    `,
    []
  );

  return rows;
}

async function listMultimediaItems(filters = {}) {
  const executor = getPool();
  const mappings = await resolveMappings(executor);
  const { tables, columns } = mappings;

  const codigoTipoMultimedia = Number(filters.codigoTipoMultimedia || 0);
  const searchText = String(filters.buscar || '').trim();
  const limit = normalizeLimit(filters.limit);

  const selectColumns = [
    `m.${quoteIdentifier(columns.multimedia.id, 'MULTIMEDIA_ID_COLUMN')} AS ${quoteIdentifier(
      'codigoMultimedia',
      'MULTIMEDIA_OUT_ID'
    )}`,
    selectColumnOrFallback('m', columns.multimedia.nombre, 'nombreMultimedia'),
    selectColumnOrFallback('m', columns.multimedia.descripcion, 'descripcion'),
    selectColumnOrFallback('m', columns.multimedia.nombreArchivo, 'nombreArchivo'),
    `m.${quoteIdentifier(
      columns.multimedia.codigoTipo,
      'MULTIMEDIA_TYPE_COLUMN'
    )} AS ${quoteIdentifier('codigoTipoMultimedia', 'MULTIMEDIA_OUT_TYPE_ID')}`,
    `t.${quoteIdentifier(
      columns.tipo.nombre,
      'MULTIMEDIA_TIPO_NAME_COLUMN'
    )} AS ${quoteIdentifier('tipoMultimedia', 'MULTIMEDIA_OUT_TYPE_NAME')}`,
    selectColumnOrFallback(
      'm',
      columns.multimedia.s3KeyPortada || columns.multimedia.s3KeyArchivo,
      's3KeyPortada',
      'NULL'
    ),
    selectColumnOrFallback('m', columns.multimedia.s3KeyArchivo, 's3KeyArchivo', 'NULL'),
    selectColumnOrFallback('m', columns.multimedia.mimeType, 'mimeType', 'NULL'),
    selectColumnOrFallback('m', columns.multimedia.urlArchivo, 'urlArchivo', 'NULL')
  ];

  const whereConditions = [];
  const params = [];

  if (columns.multimedia.isActive) {
    whereConditions.push(
      `m.${quoteIdentifier(columns.multimedia.isActive, 'MULTIMEDIA_IS_ACTIVE_COLUMN')} = 1`
    );
  }

  if (columns.tipo.isActive) {
    whereConditions.push(
      `t.${quoteIdentifier(columns.tipo.isActive, 'MULTIMEDIA_TIPO_IS_ACTIVE_COLUMN')} = 1`
    );
  }

  if (Number.isFinite(codigoTipoMultimedia) && codigoTipoMultimedia > 0) {
    whereConditions.push(
      `m.${quoteIdentifier(columns.multimedia.codigoTipo, 'MULTIMEDIA_TYPE_COLUMN')} = ?`
    );
    params.push(Math.trunc(codigoTipoMultimedia));
  }

  if (searchText) {
    const likeValue = `%${escapeLike(searchText)}%`;
    const searchParts = [
      `m.${quoteIdentifier(columns.multimedia.nombre, 'MULTIMEDIA_NAME_COLUMN')} LIKE ?`
    ];
    params.push(likeValue);

    if (columns.multimedia.descripcion) {
      searchParts.push(
        `m.${quoteIdentifier(columns.multimedia.descripcion, 'MULTIMEDIA_DESCRIPTION_COLUMN')} LIKE ?`
      );
      params.push(likeValue);
    }

    if (columns.multimedia.nombreArchivo) {
      searchParts.push(
        `m.${quoteIdentifier(columns.multimedia.nombreArchivo, 'MULTIMEDIA_FILE_NAME_COLUMN')} LIKE ?`
      );
      params.push(likeValue);
    }

    whereConditions.push(`(${searchParts.join(' OR ')})`);
  }

  const whereClause = whereConditions.length
    ? `WHERE ${whereConditions.join('\n        AND ')}`
    : '';

  const sql = `
    SELECT
      ${selectColumns.join(',\n      ')}
    FROM ${tables.multimedia} m
    INNER JOIN ${tables.tipo} t
      ON m.${quoteIdentifier(columns.multimedia.codigoTipo, 'MULTIMEDIA_TYPE_COLUMN')}
       = t.${quoteIdentifier(columns.tipo.id, 'MULTIMEDIA_TIPO_ID_COLUMN')}
    ${whereClause}
    ORDER BY m.${quoteIdentifier(columns.multimedia.nombre, 'MULTIMEDIA_NAME_COLUMN')} ASC
    LIMIT ?
  `;

  const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.trunc(limit) : 200;
  params.push(safeLimit);
  const [rows] = await runSql(executor, sql, params);

  return rows;
}

module.exports = {
  listMultimediaTypes,
  listMultimediaItems
};
