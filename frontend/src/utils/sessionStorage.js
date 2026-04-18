const SESSION_TOKEN_KEY = 'visitas.session.token';
const SESSION_USER_KEY = 'visitas.session.user';

export function storeSession(token, user) {
  if (token) {
    localStorage.setItem(SESSION_TOKEN_KEY, token);
  }

  if (user) {
    localStorage.setItem(SESSION_USER_KEY, JSON.stringify(user));
  }
}

export function getStoredToken() {
  return localStorage.getItem(SESSION_TOKEN_KEY) || '';
}

export function getStoredUser() {
  try {
    const raw = localStorage.getItem(SESSION_USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    return null;
  }
}

export function clearSession() {
  localStorage.removeItem(SESSION_TOKEN_KEY);
  localStorage.removeItem(SESSION_USER_KEY);
}
