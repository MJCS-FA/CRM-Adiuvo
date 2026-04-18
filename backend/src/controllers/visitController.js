const visitService = require('../services/visitService');
const { asyncHandler } = require('../utils/asyncHandler');

const listVisits = asyncHandler(async (req, res) => {
  const visits = await visitService.listVisits(req.user.id);
  res.status(200).json({ visits });
});

const createVisit = asyncHandler(async (req, res) => {
  const visit = await visitService.createVisit(req.user.id, req.body || {});
  res.status(201).json({ visit });
});

module.exports = {
  listVisits,
  createVisit
};
