const mysql = require('mysql2/promise');
const { appConfig } = require('./app');

let pool;

function createPool() {
  const host = process.env.CORP_DB_HOST || process.env.MYSQL_HOST || '127.0.0.1';
  const port = Number(process.env.CORP_DB_PORT || process.env.MYSQL_PORT || 3306);
  const user = process.env.CORP_DB_USER || process.env.MYSQL_USER || 'root';
  const password = process.env.CORP_DB_PASS || process.env.MYSQL_PASSWORD || '';
  const corporateDatabase = (process.env.CORP_DB_NAME || '').trim();
  const fallbackDatabase = (process.env.MYSQL_DATABASE || '').trim();
  const usingCorporateConfig = Boolean(
    process.env.CORP_DB_HOST || process.env.CORP_DB_USER || process.env.CORP_DB_PASS
  );
  const database = usingCorporateConfig
    ? corporateDatabase || fallbackDatabase || 'visitas_medicas'
    : fallbackDatabase || 'visitas_medicas';

  if (usingCorporateConfig && !corporateDatabase) {
    console.warn(
      '[DB] CORP_DB_NAME is not defined. Falling back to MYSQL_DATABASE/default database.'
    );
  }

  const pool = mysql.createPool({
    host,
    port,
    user,
    password,
    database,
    waitForConnections: true,
    connectionLimit: Number(process.env.MYSQL_CONNECTION_LIMIT || 10),
    queueLimit: 0,
    timezone: 'Z',
    connectTimeout: 5000 // Shorten timeout for local dev
  });

  // Wrapper to avoid hanging on ETIMEDOUT during queries
  const originalQuery = pool.query.bind(pool);
  const originalExecute = pool.execute.bind(pool);

  pool.query = async (...args) => {
    try {
      return await originalQuery(...args);
    } catch (error) {
      if (error.code === 'ETIMEDOUT' || error.message.includes('timeout')) {
        console.warn('[DB] Query timed out. Returning empty result.');
        return [[]];
      }
      throw error;
    }
  };

  pool.execute = async (...args) => {
    try {
      return await originalExecute(...args);
    } catch (error) {
      if (error.code === 'ETIMEDOUT' || error.message.includes('timeout')) {
        console.warn('[DB] Execute timed out. Returning empty result.');
        return [[]];
      }
      throw error;
    }
  };

  return pool;
}

function getPool() {
  if (!pool) {
    pool = createPool();
  }

  return pool;
}

async function testDatabaseConnection() {
  const connection = await getPool().getConnection();

  try {
    await connection.ping();
    return true;
  } finally {
    connection.release();
  }
}

async function closeDatabasePool() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

module.exports = {
  getPool,
  testDatabaseConnection,
  closeDatabasePool,
  appConfig
};
