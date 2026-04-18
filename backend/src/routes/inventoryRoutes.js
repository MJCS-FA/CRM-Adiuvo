const express = require('express');
const {
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
} = require('../controllers/inventoryController');
const { authMiddleware } = require('../middlewares/authMiddleware');

const router = express.Router();

router.use(authMiddleware);

router.get('/bootstrap', getInventoryBootstrap);
router.get('/my-inventory', getMyInventory);
router.get('/orders/bootstrap', getOrdersBootstrap);
router.get('/orders', getOrders);
router.get('/orders/:codigoEntrega/detail', getOrderSalidaDetail);
router.get('/requests/bootstrap', getRequestsBootstrap);
router.get('/requests', getRequests);
router.get('/requests/:codigoSolicitud/detail', getRequestDetails);
router.post('/requests', createRequest);
router.get('/products/:codigoProducto/detail/bootstrap', getProductDetailBootstrap);
router.get('/products/:codigoProducto/movements', getProductMovements);

module.exports = router;
