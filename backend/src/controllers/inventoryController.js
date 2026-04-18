const inventoryService = require('../services/inventoryService');
const { asyncHandler } = require('../utils/asyncHandler');

const getInventoryBootstrap = asyncHandler(async (req, res) => {
  const result = await inventoryService.getInventoryBootstrap(req.user.codPersonas);
  res.status(200).json(result);
});

const getMyInventory = asyncHandler(async (req, res) => {
  const result = await inventoryService.getMyInventory(
    req.user.codPersonas,
    req.query || {}
  );
  res.status(200).json(result);
});

const getProductDetailBootstrap = asyncHandler(async (req, res) => {
  const result = await inventoryService.getProductDetailBootstrap(
    req.user.codPersonas,
    req.params?.codigoProducto
  );
  res.status(200).json(result);
});

const getProductMovements = asyncHandler(async (req, res) => {
  const result = await inventoryService.getProductMovements(
    req.user.codPersonas,
    req.params?.codigoProducto,
    req.query || {}
  );
  res.status(200).json(result);
});

const getOrdersBootstrap = asyncHandler(async (req, res) => {
  const result = await inventoryService.getOrdersBootstrap(req.user.codPersonas);
  res.status(200).json(result);
});

const getOrders = asyncHandler(async (req, res) => {
  const result = await inventoryService.getOrders(
    req.user.codPersonas,
    req.query || {}
  );
  res.status(200).json(result);
});

const getOrderSalidaDetail = asyncHandler(async (req, res) => {
  const result = await inventoryService.getOrderSalidaDetail(
    req.user.codPersonas,
    req.params?.codigoEntrega
  );
  res.status(200).json(result);
});

const getRequestsBootstrap = asyncHandler(async (req, res) => {
  const result = await inventoryService.getRequestsBootstrap(req.user.codPersonas);
  res.status(200).json(result);
});

const getRequests = asyncHandler(async (req, res) => {
  const result = await inventoryService.getRequests(
    req.user.codPersonas,
    req.query || {}
  );
  res.status(200).json(result);
});

const getRequestDetails = asyncHandler(async (req, res) => {
  const result = await inventoryService.getRequestDetails(
    req.user.codPersonas,
    req.params?.codigoSolicitud
  );
  res.status(200).json(result);
});

const createRequest = asyncHandler(async (req, res) => {
  const result = await inventoryService.createRequest(
    req.user.codPersonas,
    req.body || {}
  );
  res.status(201).json(result);
});

module.exports = {
  getInventoryBootstrap,
  getMyInventory,
  getProductDetailBootstrap,
  getProductMovements,
  getOrdersBootstrap,
  getOrders,
  getOrderSalidaDetail,
  getRequestsBootstrap,
  getRequests,
  getRequestDetails,
  createRequest
};
