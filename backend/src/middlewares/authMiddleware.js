const jwt = require('jsonwebtoken');
const { appConfig } = require('../config/app');
const { AppError } = require('../utils/appError');

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const [scheme, token] = authHeader.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return next(new AppError('Authorization token is required.', 401));
  }

  try {
    const decoded = jwt.verify(token, appConfig.jwtSecret);
    req.user = {
      id: decoded.sub,
      username: decoded.username,
      hash: decoded.hash,
      personaId: decoded.personaId || null,
      codPersonas: decoded.codPersonas || decoded.personaId || null,
      displayName: decoded.displayName || decoded.username
    };
    return next();
  } catch (error) {
    return next(new AppError('Invalid or expired token.', 401));
  }
}

module.exports = {
  authMiddleware
};
