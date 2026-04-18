const multimediaService = require('../services/multimediaService');
const { asyncHandler } = require('../utils/asyncHandler');

const getMultimediaBootstrap = asyncHandler(async (req, res) => {
  const result = await multimediaService.getMultimediaBootstrap(req.user.codPersonas);
  res.status(200).json(result);
});

const getMultimediaItems = asyncHandler(async (req, res) => {
  const result = await multimediaService.getMultimediaItems(
    req.user.codPersonas,
    req.query || {}
  );
  res.status(200).json(result);
});

const resolveFileUrl = asyncHandler(async (req, res) => {
  const result = await multimediaService.resolveMultimediaFileUrl(
    req.user.codPersonas,
    req.query || {}
  );
  res.status(200).json(result);
});

module.exports = {
  getMultimediaBootstrap,
  getMultimediaItems,
  resolveFileUrl
};
