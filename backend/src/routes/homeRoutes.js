const express = require('express');
const {
  getActiveCycle,
  getMedicalSummary,
  getBranchSummary,
  getBirthdays,
  getOverview
} = require('../controllers/homeController');
const { authMiddleware } = require('../middlewares/authMiddleware');

const router = express.Router();

router.use(authMiddleware);

router.get('/active-cycle', getActiveCycle);
router.get('/summary/medical', getMedicalSummary);
router.get('/summary/branch', getBranchSummary);
router.get('/birthdays', getBirthdays);
router.get('/overview', getOverview);

module.exports = router;
