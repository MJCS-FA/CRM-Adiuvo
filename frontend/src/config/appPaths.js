const DEFAULT_APP_BASE_PATH = '/visitas/';
const DEFAULT_API_BASE_URL = '/visitas/api';
const DEFAULT_DEV_PROXY_TARGET = 'http://localhost:4000';

function ensureLeadingSlash(value) {
  if (!value) {
    return '/';
  }

  return value.startsWith('/') ? value : `/${value}`;
}

export function normalizeBasePath(value = DEFAULT_APP_BASE_PATH) {
  const trimmed = String(value || '').trim();

  if (!trimmed || trimmed === '/') {
    return '/';
  }

  const normalized = ensureLeadingSlash(trimmed).replace(/\/+$/, '');
  return `${normalized}/`;
}

export function normalizeApiPath(value = DEFAULT_API_BASE_URL) {
  const trimmed = String(value || '').trim();

  if (!trimmed) {
    return DEFAULT_API_BASE_URL;
  }

  return ensureLeadingSlash(trimmed).replace(/\/+$/, '');
}

export function deriveBasePathFromApiPath(apiPath = DEFAULT_API_BASE_URL) {
  const normalizedApiPath = normalizeApiPath(apiPath);
  const withoutApiSuffix = normalizedApiPath.replace(/\/api$/i, '') || '/';

  return normalizeBasePath(withoutApiSuffix);
}

export function resolveAppPaths(env = {}) {
  const configuredApiBaseUrl = String(
    env.VITE_API_BASE_URL || DEFAULT_API_BASE_URL
  ).trim();
  const configuredBasePath = String(env.VITE_APP_BASE_PATH || env.BASE_URL || '').trim();

  let apiBaseUrl = configuredApiBaseUrl || DEFAULT_API_BASE_URL;
  let apiPath = DEFAULT_API_BASE_URL;
  let proxyTarget = String(env.VITE_DEV_PROXY_TARGET || DEFAULT_DEV_PROXY_TARGET).trim();

  try {
    const parsedUrl = new URL(configuredApiBaseUrl);
    apiPath = normalizeApiPath(parsedUrl.pathname || DEFAULT_API_BASE_URL);
    apiBaseUrl = `${parsedUrl.origin}${apiPath}`;
    proxyTarget = parsedUrl.origin;
  } catch {
    apiPath = normalizeApiPath(apiBaseUrl);
  }

  const appBasePath = configuredBasePath
    ? normalizeBasePath(configuredBasePath)
    : deriveBasePathFromApiPath(apiPath);

  return {
    appBasePath,
    routerBasename: appBasePath === '/' ? '/' : appBasePath.slice(0, -1),
    apiBaseUrl,
    apiPath,
    proxyTarget
  };
}

export const appPaths = resolveAppPaths(import.meta.env);
