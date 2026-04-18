const { getPool } = require('../config/database');

async function findByHash(hash) {
  const [rows] = await getPool().execute(
    'SELECT id, username, hash, created_at AS createdAt FROM app_users WHERE hash = ? LIMIT 1',
    [hash]
  );

  return rows[0] || null;
}

async function createUser({ username, hash }) {
  const [result] = await getPool().execute(
    'INSERT INTO app_users (username, hash) VALUES (?, ?)',
    [username, hash]
  );

  return {
    id: result.insertId,
    username,
    hash
  };
}

module.exports = {
  findByHash,
  createUser
};
