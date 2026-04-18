const { appConfig } = require('../config/app');
const { getPool } = require('../config/database');
const { AppError } = require('../utils/appError');

const runtimeQueryCache = new Map();

function quoteIdentifier(value, label) {
  if (!/^[A-Za-z0-9_]+$/.test(value || '')) {
    throw new AppError(`Invalid identifier for ${label}.`, 500);
  }

  return `\`${value}\``;
}

function quoteQualifiedIdentifier(value, label) {
  const parts = String(value || '')
    .split('.')
    .map((part) => part.trim())
    .filter(Boolean);

  if (!parts.length || parts.length > 2) {
    throw new AppError(`Invalid identifier for ${label}.`, 500);
  }

  return parts
    .map((part, index) =>
      quoteIdentifier(part, `${label}_${index === parts.length - 1 ? 'TABLE' : 'SCHEMA'}`)
    )
    .join('.');
}

function normalizeKey(value) {
  return String(value || '').trim().toLowerCase();
}

function uniqueCandidates(candidates = []) {
  const seen = new Set();
  const result = [];

  for (const candidate of candidates) {
    const key = normalizeKey(candidate);
    if (!key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(String(candidate).trim());
  }

  return result;
}

function pickColumn(columns = [], candidates = []) {
  const byKey = new Map();

  for (const column of columns) {
    byKey.set(normalizeKey(column), column);
  }

  for (const candidate of uniqueCandidates(candidates)) {
    const match = byKey.get(normalizeKey(candidate));
    if (match) {
      return match;
    }
  }

  return null;
}

function parseQualifiedTableName(tableName) {
  const parts = String(tableName || '')
    .split('.')
    .map((part) => part.trim())
    .filter(Boolean);

  if (!parts.length || parts.length > 2) {
    throw new AppError('Invalid identifier for PERSONAS_TABLE.', 500);
  }

  if (parts.length === 1) {
    return {
      schema: null,
      table: parts[0]
    };
  }

  return {
    schema: parts[0],
    table: parts[1]
  };
}

async function getTableColumns(tableName) {
  const { schema, table } = parseQualifiedTableName(tableName);
  const cacheKey = `${normalizeKey(schema || 'current')}.${normalizeKey(table)}`;

  if (runtimeQueryCache.has(`columns:${cacheKey}`)) {
    return runtimeQueryCache.get(`columns:${cacheKey}`);
  }

  const sql = `
    SELECT COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = ${schema ? '?' : 'DATABASE()'}
      AND TABLE_NAME = ?
    ORDER BY ORDINAL_POSITION
  `;

  const params = schema ? [schema, table] : [table];
  const [rows] = await getPool().execute(sql, params);
  const columns = rows.map((row) => row.COLUMN_NAME).filter(Boolean);

  runtimeQueryCache.set(`columns:${cacheKey}`, columns);
  return columns;
}

function buildFindByUsernameQueryFromConfig(includeCountryFilter = true) {
  const {
    tableName,
    idColumn,
    usernameColumn,
    credentialsColumn,
    nameColumn,
    countryColumn
  } = appConfig.personasAuth;

  const table = quoteQualifiedIdentifier(tableName, 'PERSONAS_TABLE');
  const id = quoteIdentifier(idColumn, 'PERSONAS_ID_COLUMN');
  const username = quoteIdentifier(usernameColumn, 'PERSONAS_USERNAME_COLUMN');
  const credentials = quoteIdentifier(
    credentialsColumn,
    'PERSONAS_CREDENTIALS_COLUMN'
  );
  const displayName = quoteIdentifier(nameColumn, 'PERSONAS_NAME_COLUMN');
  const country = includeCountryFilter
    ? quoteIdentifier(countryColumn, 'PERSONAS_COUNTRY_COLUMN')
    : null;

  const whereCountry = includeCountryFilter ? `\n      AND ${country} = ?` : '';

  return `
    SELECT
      ${id} AS personaId,
      ${username} AS username,
      ${credentials} AS credentialsHash,
      ${displayName} AS displayName
    FROM ${table}
    WHERE LOWER(TRIM(${username})) = LOWER(TRIM(?))
      ${whereCountry}
    LIMIT 1
  `;
}

function buildDynamicQueryContext(columns = []) {
  const {
    tableName,
    idColumn,
    usernameColumn,
    credentialsColumn,
    nameColumn,
    countryColumn
  } = appConfig.personasAuth;

  const idResolved = pickColumn(columns, [
    idColumn,
    'idPersona',
    'IdPersona',
    'CodigoPersona',
    'Codigo_Persona',
    'Codigo_Personas',
    'CodPersona'
  ]);
  const usernameResolved = pickColumn(columns, [
    usernameColumn,
    'Correo_electronico',
    'CorreoElectronico',
    'Email',
    'Correo',
    'Usuario',
    'Username',
    'UserName'
  ]);
  const credentialsResolved = pickColumn(columns, [
    credentialsColumn,
    'credenciales',
    'Credenciales',
    'credencial',
    'Credencial',
    'password_hash',
    'PasswordHash',
    'HashPassword'
  ]);
  const displayResolved =
    pickColumn(columns, [nameColumn, usernameColumn, 'NombrePersona', 'Nombre', 'Correo_electronico']) ||
    usernameResolved;
  const countryResolved = pickColumn(columns, [
    countryColumn,
    'CodigoPais',
    'Codigo_Pais',
    'CodPais'
  ]);

  const missing = [];

  if (!idResolved) {
    missing.push('PERSONAS_ID_COLUMN');
  }

  if (!usernameResolved) {
    missing.push('PERSONAS_USERNAME_COLUMN');
  }

  if (!credentialsResolved) {
    missing.push('PERSONAS_CREDENTIALS_COLUMN');
  }

  if (missing.length) {
    throw new AppError(
      'Unable to resolve tblPersonas mapping. Configure PERSONAS_* environment variables.',
      500,
      {
        missing,
        availableColumns: columns
      }
    );
  }

  const table = quoteQualifiedIdentifier(tableName, 'PERSONAS_TABLE');
  const id = quoteIdentifier(idResolved, 'PERSONAS_ID_COLUMN');
  const username = quoteIdentifier(usernameResolved, 'PERSONAS_USERNAME_COLUMN');
  const credentials = quoteIdentifier(
    credentialsResolved,
    'PERSONAS_CREDENTIALS_COLUMN'
  );
  const displayName = quoteIdentifier(displayResolved, 'PERSONAS_NAME_COLUMN');
  const country = countryResolved
    ? quoteIdentifier(countryResolved, 'PERSONAS_COUNTRY_COLUMN')
    : null;
  const includeCountryFilter = Boolean(country);
  const whereCountry = includeCountryFilter ? `\n      AND ${country} = ?` : '';

  return {
    sql: `
      SELECT
        ${id} AS personaId,
        ${username} AS username,
        ${credentials} AS credentialsHash,
        ${displayName} AS displayName
      FROM ${table}
      WHERE LOWER(TRIM(${username})) = LOWER(TRIM(?))
        ${whereCountry}
      LIMIT 1
    `,
    includeCountryFilter
  };
}

async function executeFindByUsernameQuery(sql, username, includeCountryFilter) {
  const params = includeCountryFilter
    ? [username, appConfig.personasAuth.countryValue]
    : [username];
  const [rows] = await getPool().execute(sql, params);

  return rows[0] || null;
}

function isColumnOrTableMappingError(error) {
  const code = String(error?.code || '').toUpperCase();
  return code === 'ER_BAD_FIELD_ERROR' || code === 'ER_NO_SUCH_TABLE' || code === 'ER_BAD_TABLE_ERROR';
}

async function findByUsername(username) {
  const configuredWithCountrySql = buildFindByUsernameQueryFromConfig(true);

  try {
    return await executeFindByUsernameQuery(configuredWithCountrySql, username, true);
  } catch (error) {
    if (!isColumnOrTableMappingError(error)) {
      throw error;
    }
  }

  const configuredNoCountrySql = buildFindByUsernameQueryFromConfig(false);

  try {
    return await executeFindByUsernameQuery(configuredNoCountrySql, username, false);
  } catch (error) {
    if (!isColumnOrTableMappingError(error)) {
      throw error;
    }
  }

  const cacheKey = `dynamicQuery:${normalizeKey(appConfig.personasAuth.tableName)}`;
  let dynamicContext = runtimeQueryCache.get(cacheKey);

  if (!dynamicContext) {
    const columns = await getTableColumns(appConfig.personasAuth.tableName);
    dynamicContext = buildDynamicQueryContext(columns);
    runtimeQueryCache.set(cacheKey, dynamicContext);
  }

  return executeFindByUsernameQuery(
    dynamicContext.sql,
    username,
    dynamicContext.includeCountryFilter
  );
}

module.exports = {
  findByUsername
};
