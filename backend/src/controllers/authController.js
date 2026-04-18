const authService = require('../services/authService');
const { asyncHandler } = require('../utils/asyncHandler');

const login = asyncHandler(async (req, res) => {
  const { username, password } = req.body || {};

  const result = await authService.login({ username, password });

  res.status(200).json(result);
});

const me = asyncHandler(async (req, res) => {
  res.status(200).json({
    user: req.user
  });
});

module.exports = {
  login,
  me
};
