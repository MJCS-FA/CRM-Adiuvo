const express = require('express');
const {
  getVisitador,
  getVisitTypes,
  getVisitChannels,
  getCancellationReasons,
  getAssignedDoctors,
  getAssignedBranches,
  getMonthVisits,
  createVisit,
  updateVisit
} = require('../controllers/calendarController');
const { authMiddleware } = require('../middlewares/authMiddleware');

const router = express.Router();

router.use(authMiddleware);

router.get('/visitador', getVisitador);
router.get('/catalogs/tipos-visita', getVisitTypes);
router.get('/catalogs/canales-visita', getVisitChannels);
router.get('/catalogs/motivos-cancelacion', getCancellationReasons);
router.get('/catalogs/motivo-cancelacion', getCancellationReasons);
router.get('/catalogos/motivos-cancelacion', getCancellationReasons);
router.get('/catalogs/medicos', getAssignedDoctors);
router.get('/catalogs/sucursales', getAssignedBranches);
router.get('/visits', getMonthVisits);
router.post('/visits', createVisit);
router.patch('/visits/:visitId', updateVisit);

module.exports = router;
