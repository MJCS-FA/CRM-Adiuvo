const { AppError } = require('../utils/appError');
const visitRepository = require('../repositories/visitRepository');

function normalizeVisitPayload(payload = {}) {
  return {
    doctorName: String(payload.doctorName || '').trim(),
    location: String(payload.location || '').trim(),
    visitDate: String(payload.visitDate || '').trim(),
    notes: String(payload.notes || '').trim(),
    status: String(payload.status || 'pending').trim(),
    clientTempId: payload.clientTempId ? String(payload.clientTempId).trim() : null
  };
}

function validateVisitPayload(payload) {
  if (!payload.doctorName) {
    throw new AppError('Doctor name is required.', 400);
  }

  if (!payload.location) {
    throw new AppError('Location is required.', 400);
  }

  if (!payload.visitDate) {
    throw new AppError('Visit date is required.', 400);
  }

  const asDate = new Date(payload.visitDate);

  if (Number.isNaN(asDate.getTime())) {
    throw new AppError('Visit date format is invalid.', 400);
  }

  return {
    ...payload,
    visitDate: asDate.toISOString().slice(0, 19).replace('T', ' ')
  };
}

async function listVisits(userId) {
  return visitRepository.listByUserId(userId);
}

async function createVisit(userId, rawPayload) {
  const normalized = normalizeVisitPayload(rawPayload);
  const payload = validateVisitPayload(normalized);

  const created = await visitRepository.createVisit({
    userId,
    doctorName: payload.doctorName,
    location: payload.location,
    visitDate: payload.visitDate,
    notes: payload.notes,
    status: payload.status || 'pending',
    clientTempId: payload.clientTempId
  });

  return created;
}

module.exports = {
  listVisits,
  createVisit
};
