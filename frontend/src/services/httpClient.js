import axios from 'axios';
import { appPaths } from '../config/appPaths';
import {
  buildRequestCacheKey,
  enqueueOfflineMutation,
  getCachedApiResponse,
  getCachedApiResponseByPath,
  setCachedApiResponse
} from '../offline/apiOfflineStore';
import { getStoredToken } from '../utils/sessionStorage';

const OFFLINE_SYNC_HEADER = 'x-offline-sync';
const OFFLINE_CACHE_BYPASS_HEADER = 'x-offline-cache-bypass';
const OFFLINE_PATH_FALLBACK_HEADER = 'x-offline-path-fallback';

function normalizeMethod(value) {
  return String(value || 'get').trim().toLowerCase();
}

function canUseNavigator() {
  return typeof navigator !== 'undefined';
}

function isOnline() {
  if (!canUseNavigator()) {
    return true;
  }

  return navigator.onLine;
}

function sanitizePath(value) {
  const text = String(value || '').trim();

  if (!text) {
    return '/';
  }

  try {
    const parsed = new URL(text, 'http://offline.local');
    return parsed.pathname || '/';
  } catch {
    return text.startsWith('/') ? text : `/${text}`;
  }
}

function isAuthEndpoint(path) {
  const normalizedPath = sanitizePath(path).toLowerCase();
  return normalizedPath.startsWith('/auth/');
}

function isCacheableGetRequest(config = {}) {
  const method = normalizeMethod(config.method);

  if (method !== 'get') {
    return false;
  }

  if (Boolean(config?.headers?.[OFFLINE_CACHE_BYPASS_HEADER])) {
    return false;
  }

  return !isAuthEndpoint(config.url);
}

function canQueueMutation(config = {}) {
  const method = normalizeMethod(config.method);

  if (['get', 'head', 'options'].includes(method)) {
    return false;
  }

  if (Boolean(config?.headers?.[OFFLINE_SYNC_HEADER])) {
    return false;
  }

  return !isAuthEndpoint(config.url);
}

function createOfflineCacheMissError(config = {}) {
  const error = new Error('No hay conexion y no existe cache local para esta consulta.');
  error.code = 'OFFLINE_CACHE_MISS';
  error.isOfflineError = true;
  error.requestKey = buildRequestCacheKey(config);
  return error;
}

function createOfflineUnavailableError() {
  const error = new Error(
    'No hay conexion disponible para completar esta operacion en este momento.'
  );
  error.code = 'OFFLINE_UNAVAILABLE';
  error.isOfflineError = true;
  return error;
}

function buildQueuedResponse(config = {}) {
  return {
    data: {
      queued: true,
      offline: true,
      message:
        'Accion guardada localmente. Se sincronizara automaticamente cuando vuelva la conexion.'
    },
    status: 202,
    statusText: 'Accepted',
    headers: {
      'x-offline-queued': '1'
    },
    config,
    request: {
      fromOfflineQueue: true
    }
  };
}

function buildCachedResponse(config = {}, cached = {}) {
  const usedPathFallback = Boolean(cached?.usedPathFallback);

  return {
    data: cached.data,
    status: Number(cached.status || 200),
    statusText: 'OK',
    headers: cached.headers || {},
    config,
    request: {
      fromOfflineCache: true,
      fromOfflineCachePathFallback: usedPathFallback
    }
  };
}

function isNetworkError(error) {
  if (!error) {
    return false;
  }

  return !error.response;
}

function shouldUsePathFallback(config = {}) {
  const headerValue = String(config?.headers?.[OFFLINE_PATH_FALLBACK_HEADER] || '').trim();

  if (!headerValue) {
    return true;
  }

  return !['0', 'false', 'no'].includes(headerValue.toLowerCase());
}

async function resolveCachedResponse(config = {}) {
  const cached = await getCachedApiResponse(config);

  if (!cached) {
    if (!shouldUsePathFallback(config)) {
      return null;
    }

    const fallbackCached = await getCachedApiResponseByPath(config);

    if (!fallbackCached) {
      return null;
    }

    return buildCachedResponse(config, {
      ...fallbackCached,
      usedPathFallback: true
    });
  }

  return buildCachedResponse(config, cached);
}
export const httpClient = axios.create({
  baseURL: appPaths.apiBaseUrl,
  timeout: 20000
});

httpClient.interceptors.request.use(async (config) => {
  const token = getStoredToken();

  if (!config.headers) {
    config.headers = {};
  }

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  if (Boolean(config.headers[OFFLINE_SYNC_HEADER])) {
    return config;
  }

  if (isOnline()) {
    return config;
  }

  if (isCacheableGetRequest(config)) {
    const cachedResponse = await resolveCachedResponse(config);

    if (cachedResponse) {
      config.adapter = async () => cachedResponse;
      return config;
    }

    throw createOfflineCacheMissError(config);
  }

  if (canQueueMutation(config)) {
    await enqueueOfflineMutation(config);
    config.adapter = async () => buildQueuedResponse(config);
    return config;
  }

  throw createOfflineUnavailableError();
});

httpClient.interceptors.response.use(
  async (response) => {
    if (isCacheableGetRequest(response?.config) && Number(response?.status || 0) >= 200) {
      await setCachedApiResponse(response.config, response);
    }

    return response;
  },
  async (error) => {
    const config = error?.config || {};

    if (Boolean(config?.headers?.[OFFLINE_SYNC_HEADER])) {
      return Promise.reject(error);
    }

    if (isCacheableGetRequest(config) && (isNetworkError(error) || !isOnline())) {
      const cachedResponse = await resolveCachedResponse(config);
      if (cachedResponse) {
        return cachedResponse;
      }

      return Promise.reject(createOfflineCacheMissError(config));
    }

    if (canQueueMutation(config) && (isNetworkError(error) || !isOnline())) {
      await enqueueOfflineMutation(config);
      return buildQueuedResponse(config);
    }

    return Promise.reject(error);
  }
);


