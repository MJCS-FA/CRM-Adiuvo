const express = require('express');
const { listVisits, createVisit } = require('../controllers/visitController');
const { authMiddleware } = require('../middlewares/authMiddleware');

const router = express.Router();

router.use(authMiddleware);
router.get('/', listVisits);
router.post('/', createVisit);

module.exports = router;
