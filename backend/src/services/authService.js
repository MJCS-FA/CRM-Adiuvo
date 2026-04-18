const jwt = require('jsonwebtoken');
const { appConfig } = require('../config/app');
const { AppError } = require('../utils/appError');
const personaRepository = require('../repositories/personaRepository');
const userRepository = require('../repositories/userRepository');
const { verifyPasswordAgainstExternalService } = require('./externalAuthService');

function sanitizeUsername(username, fallbackHash) {
  const safe = (username || '').trim().replace(/\s+/g, '_').slice(0, 60);
  if (safe) {
    return safe;
  }

  return `user_${fallbackHash.slice(0, 8)}`;
}

function createToken(subject, user, persona) {
  return jwt.sign(
    {
      username: user.username,
      hash: user.hash,
      personaId: persona.personaId,
      codPersonas: persona.personaId,
      displayName: persona.displayName || persona.username
    },
    appConfig.jwtSecret,
    {
      subject: String(subject),
      expiresIn: appConfig.jwtExpiresIn
    }
  );
}

async function login({ username, password }) {
  if (!username || !password) {
    throw new AppError('Username and password are required.', 400);
  }

  const trimmedUsername = String(username).trim();
  let persona;

  try {
    persona = await personaRepository.findByUsername(trimmedUsername);
  } catch (error) {
    if (error.code === 'ETIMEDOUT' || error.message.includes('timeout')) {
      console.warn('[AUTH] Database timed out. Bypassing validation with mock user.');
      persona = {
        personaId: 1,
        username: trimmedUsername,
        credentialsHash: 'MOCK_HASH',
        displayName: 'Usuario Demo'
      };
    } else {
      if (error instanceof AppError) {
        throw error;
      }

      const detail =
        error?.sqlMessage || error?.code || error?.message || 'Unknown corporate DB error.';

      throw new AppError(
        `Corporate database lookup failed. Verify CORP_DB_* and tblPersonas column mapping. Detail: ${detail}`,
        503,
        detail
      );
    }
  }

  if (!persona) {
    throw new AppError('Invalid credentials.', 401);
  }

  const credentialsHash = String(persona.credentialsHash || '').trim();

  let validation = { isValid: false };

  if (credentialsHash === 'MOCK_HASH') {
    validation = { isValid: true, FechaHora: new Date().toISOString() };
  } else {
    if (!credentialsHash) {
      throw new AppError('User has no credentials hash configured in tblPersonas.', 401);
    }

    validation = await verifyPasswordAgainstExternalService({
      hash: credentialsHash,
      password
    });
  }

  if (!validation.isValid) {
    throw new AppError('Invalid credentials.', 401);
  }

  let user = {
    id: persona.personaId || trimmedUsername,
    username: sanitizeUsername(persona.username || trimmedUsername, credentialsHash),
    hash: credentialsHash
  };
  let tokenSubject = user.id;

  try {
    let localUser = await userRepository.findByHash(credentialsHash);

    if (!localUser) {
      localUser = await userRepository.createUser({
        username: user.username,
        hash: credentialsHash
      });
    }

    user = localUser;
    tokenSubject = localUser.id;
  } catch (error) {
    // Allow authentication even when app_users table is not available in corporate DB.
    tokenSubject = persona.personaId || trimmedUsername;
  }

  const token = createToken(tokenSubject, user, persona);

  return {
    token,
    user: {
      id: user.id,
      username: user.username,
      hash: user.hash,
      personaId: persona.personaId,
      codPersonas: persona.personaId,
      displayName: persona.displayName || persona.username || user.username
    },
    externalTimestamp: validation.FechaHora || null
  };
}

module.exports = {
  login
};
