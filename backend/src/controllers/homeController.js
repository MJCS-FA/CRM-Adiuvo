const homeService = require('../services/homeService');
const { asyncHandler } = require('../utils/asyncHandler');

const getActiveCycle = asyncHandler(async (req, res) => {
  const result = await homeService.getActiveCycle(req.user.codPersonas);
  res.status(200).json(result);
});

const getMedicalSummary = asyncHandler(async (req, res) => {
  const result = await homeService.getMedicalSummary(req.user.codPersonas);
  res.status(200).json(result);
});

const getBranchSummary = asyncHandler(async (req, res) => {
  const result = await homeService.getBranchSummary(req.user.codPersonas);
  res.status(200).json(result);
});

const getBirthdays = asyncHandler(async (req, res) => {
  const result = await homeService.getMonthBirthdays(
    req.user.codPersonas,
    req.query?.month
  );
  res.status(200).json(result);
});

const getOverview = asyncHandler(async (req, res) => {
  const [cycle, medical, branch, birthdays] = await Promise.all([
    homeService.getActiveCycle(req.user.codPersonas),
    homeService.getMedicalSummary(req.user.codPersonas),
    homeService.getBranchSummary(req.user.codPersonas),
    homeService.getMonthBirthdays(req.user.codPersonas, req.query?.month)
  ]);

  res.status(200).json({
    cycle,
    medical,
    branch,
    birthdays
  });
});

module.exports = {
  getActiveCycle,
  getMedicalSummary,
  getBranchSummary,
  getBirthdays,
  getOverview
};
