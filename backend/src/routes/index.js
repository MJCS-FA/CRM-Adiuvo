const express = require('express');
const healthRouter = require('./healthRoutes');
const authRouter = require('./authRoutes');
const visitRouter = require('./visitRoutes');
const directoryRouter = require('./directoryRoutes');
const calendarRouter = require('./calendarRoutes');
const homeRouter = require('./homeRoutes');
const visitExecutionRouter = require('./visitExecutionRoutes');
const inventoryRouter = require('./inventoryRoutes');
const multimediaRouter = require('./multimediaRoutes');

const router = express.Router();

router.use('/health', healthRouter);
router.use('/auth', authRouter);
router.use('/visits', visitRouter);
router.use('/directory', directoryRouter);
router.use('/calendar', calendarRouter);
router.use('/home', homeRouter);
router.use('/visit-execution', visitExecutionRouter);
router.use('/inventory', inventoryRouter);
router.use('/multimedia', multimediaRouter);

module.exports = router;
