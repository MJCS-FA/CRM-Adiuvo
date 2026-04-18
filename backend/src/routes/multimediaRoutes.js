const express = require('express');
const {
  getMultimediaBootstrap,
  getMultimediaItems,
  resolveFileUrl
} = require('../controllers/multimediaController');
const { authMiddleware } = require('../middlewares/authMiddleware');

const router = express.Router();

router.use(authMiddleware);

router.get('/bootstrap', getMultimediaBootstrap);
router.get('/items', getMultimediaItems);
router.get('/file-url', resolveFileUrl);

module.exports = router;
