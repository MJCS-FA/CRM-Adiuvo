const calendarService = require('../services/calendarService');
const { asyncHandler } = require('../utils/asyncHandler');

function currentMonthKey() {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

const getVisitador = asyncHandler(async (req, res) => {
  const result = await calendarService.getVisitadorBySession(req.user.codPersonas);
  res.status(200).json(result);
});

const getVisitTypes = asyncHandler(async (req, res) => {
  const items = await calendarService.getVisitTypeCatalog();
  res.status(200).json({ items });
});

const getVisitChannels = asyncHandler(async (req, res) => {
  const items = await calendarService.getVisitChannelCatalog();
  res.status(200).json({ items });
});

const getCancellationReasons = asyncHandler(async (_req, res) => {
  const items = await calendarService.getCancellationReasonCatalog();
  res.status(200).json({ items });
});

const getAssignedDoctors = asyncHandler(async (req, res) => {
  const result = await calendarService.getAssignedDoctorsCatalog(req.user.codPersonas);
  res.status(200).json(result);
});

const getAssignedBranches = asyncHandler(async (req, res) => {
  const result = await calendarService.getAssignedBranchesCatalog(req.user.codPersonas);
  res.status(200).json(result);
});

const getMonthVisits = asyncHandler(async (req, res) => {
  const month = String(req.query?.month || currentMonthKey());
  const result = await calendarService.getMonthVisits(req.user.codPersonas, month);
  res.status(200).json(result);
});

const createVisit = asyncHandler(async (req, res) => {
  const result = await calendarService.createVisit(req.user.codPersonas, req.body || {});
  res.status(201).json(result);
});

const updateVisit = asyncHandler(async (req, res) => {
  const visitId = req.params.visitId;
  const result = await calendarService.updateVisit(req.user.codPersonas, visitId, req.body || {});
  res.status(200).json(result);
});

module.exports = {
  getVisitador,
  getVisitTypes,
  getVisitChannels,
  getCancellationReasons,
  getAssignedDoctors,
  getAssignedBranches,
  getMonthVisits,
  createVisit,
  updateVisit
};
