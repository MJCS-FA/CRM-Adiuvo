const visitExecutionService = require('../services/visitExecutionService');
const { asyncHandler } = require('../utils/asyncHandler');

const getVisitExecutionBootstrap = asyncHandler(async (req, res) => {
  const result = await visitExecutionService.getBootstrap(
    req.user.codPersonas,
    req.params.visitId
  );

  res.status(200).json(result);
});

const getVisitExecutionProducts = asyncHandler(async (req, res) => {
  const result = await visitExecutionService.getProductsBySelection(
    req.user.codPersonas,
    req.query || {}
  );

  res.status(200).json(result);
});

const getVisitExecutionDetail = asyncHandler(async (req, res) => {
  const result = await visitExecutionService.getVisitDetail(
    req.user.codPersonas,
    req.params.visitId
  );

  res.status(200).json(result);
});

const getVisitExecutionSampleOrderProducts = asyncHandler(async (req, res) => {
  const result = await visitExecutionService.getSampleOrderProducts(
    req.user.codPersonas,
    req.params.visitId
  );

  res.status(200).json(result);
});

const createVisitExecutionSampleOrder = asyncHandler(async (req, res) => {
  const result = await visitExecutionService.createSampleOrder(
    req.user.codPersonas,
    req.params.visitId,
    req.body || {}
  );

  res.status(200).json(result);
});

const finalizeVisitExecution = asyncHandler(async (req, res) => {
  const result = await visitExecutionService.finalizeVisit(
    req.user.codPersonas,
    req.params.visitId,
    req.body || {}
  );

  res.status(200).json(result);
});

module.exports = {
  getVisitExecutionBootstrap,
  getVisitExecutionProducts,
  getVisitExecutionDetail,
  getVisitExecutionSampleOrderProducts,
  createVisitExecutionSampleOrder,
  finalizeVisitExecution
};
