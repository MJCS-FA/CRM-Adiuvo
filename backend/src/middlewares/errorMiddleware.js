const { AppError } = require('../utils/appError');

function notFoundHandler(req, res, next) {
  next(new AppError(`Route not found: ${req.method} ${req.originalUrl}`, 404));
}

function errorHandler(err, req, res, next) {
  const statusCode = err.statusCode || 500;
  const isServerError = statusCode >= 500;

  if (isServerError) {
    console.error('[Unhandled Error]', err);
  }

  res.status(statusCode).json({
    message: err.message || 'Unexpected error.',
    details: err.details || null,
    path: req.originalUrl,
    timestamp: new Date().toISOString()
  });
}

module.exports = {
  notFoundHandler,
  errorHandler
};
