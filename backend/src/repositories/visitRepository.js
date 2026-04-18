const { getPool } = require('../config/database');

async function listByUserId(userId) {
  const [rows] = await getPool().execute(
    `SELECT
      id,
      doctor_name AS doctorName,
      location,
      visit_date AS visitDate,
      notes,
      status,
      client_temp_id AS clientTempId,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM visits
    WHERE user_id = ?
    ORDER BY created_at DESC`,
    [userId]
  );

  return rows;
}

async function createVisit({ userId, doctorName, location, visitDate, notes, status, clientTempId }) {
  const [result] = await getPool().execute(
    `INSERT INTO visits
      (user_id, doctor_name, location, visit_date, notes, status, client_temp_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [userId, doctorName, location, visitDate, notes, status, clientTempId || null]
  );

  const [rows] = await getPool().execute(
    `SELECT
      id,
      doctor_name AS doctorName,
      location,
      visit_date AS visitDate,
      notes,
      status,
      client_temp_id AS clientTempId,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM visits
    WHERE id = ?
    LIMIT 1`,
    [result.insertId]
  );

  return rows[0] || null;
}

module.exports = {
  listByUserId,
  createVisit
};
