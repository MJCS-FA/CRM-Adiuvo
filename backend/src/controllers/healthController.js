const { testDatabaseConnection } = require('../config/database');
const { asyncHandler } = require('../utils/asyncHandler');

const getHealthStatus = asyncHandler(async (req, res) => {
  let database = 'unreachable';

  try {
    await testDatabaseConnection();
    database = 'ok';
  } catch (error) {
    database = 'unreachable';
  }

  res.status(200).json({
    status: 'ok',
    database,
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

module.exports = {
  getHealthStatus
};
