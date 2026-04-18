const express = require('express');
const {
  getVisitExecutionBootstrap,
  getVisitExecutionProducts,
  getVisitExecutionDetail,
  getVisitExecutionSampleOrderProducts,
  createVisitExecutionSampleOrder,
  finalizeVisitExecution
} = require('../controllers/visitExecutionController');
const { authMiddleware } = require('../middlewares/authMiddleware');

const router = express.Router();

router.use(authMiddleware);

router.get('/visits/:visitId/bootstrap', getVisitExecutionBootstrap);
router.get('/visits/:visitId/detail', getVisitExecutionDetail);
router.get(
  '/visits/:visitId/sample-order/products',
  getVisitExecutionSampleOrderProducts
);
router.post('/visits/:visitId/sample-order', createVisitExecutionSampleOrder);
router.get('/products', getVisitExecutionProducts);
router.post('/visits/:visitId/finalize', finalizeVisitExecution);

module.exports = router;
