const axios = require('axios');
const { appConfig } = require('../config/app');
const { AppError } = require('../utils/appError');

async function verifyPasswordAgainstExternalService({ hash, password }) {
  if (!hash || !password) {
    throw new AppError('Hash and password are required for authentication.', 400);
  }

  try {
    const { data } = await axios.get(appConfig.outsystemsVerifyUrl, {
      params: {
        Hash: hash,
        Pass: password
      },
      timeout: 15000
    });

    if (typeof data?.isValid !== 'boolean') {
      throw new AppError('Invalid response from external authentication service.', 502);
    }

    return data;
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    const message = error.response
      ? `External authentication failed with status ${error.response.status}.`
      : 'External authentication service is unavailable.';

    throw new AppError(message, 502, error.response?.data || null);
  }
}

module.exports = {
  verifyPasswordAgainstExternalService
};
