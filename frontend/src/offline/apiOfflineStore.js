import { getStoredUser } from '../utils/sessionStorage';
import { getOfflineDb } from './db';

const API_CACHE_STORE = 'apiResponseCache';
const API_MUTATIONS_STORE = 'pendingApiMutations';

function normalizeMethod(value) {
  return String(value || 'get').trim().toUpperCase();
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

function normalizeParams(value) {
  if (!value || typeof value !== 'object') {
    return {};
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeParams(item));
  }

  const keys = Object.keys(value).sort();
  const normalized = {};

  for (const key of keys) {
    const current = value[key];

    if (current === undefined) {
      continue;
    }

    normalized[key] = normalizeParams(current);
  }

  return normalized;
}

function toSerializable(value, fallback = null) {
  if (value === undefined) {
    return fallback;
  }

  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return fallback;
  }
}

function toStringMap(value) {
  if (!value || typeof value !== 'object') {
    return {};
  }

  const output = {};

  for (const [key, current] of Object.entries(value)) {
    const normalizedKey = String(key || '').trim();
    if (!normalizedKey) {
      continue;
    }

    output[normalizedKey] =
      current === null || current === undefined ? '' : String(current);
  }

  return output;
}

function sanitizeHeaders(value) {
  const source = toStringMap(value);
  const output = {};

  for (const [key, current] of Object.entries(source)) {
    const normalizedKey = key.toLowerCase();

    if (
      normalizedKey === 'authorization' ||
      normalizedKey === 'cookie' ||
      normalizedKey === 'set-cookie'
    ) {
      continue;
    }

    output[key] = current;
  }

  return output;
}

export function getOfflineScopeKey() {
  const user = getStoredUser() || {};
  const personId = Number(user.codPersonas || user.personaId || user.id || 0);

  if (Number.isFinite(personId) && personId > 0) {
    return `user:${Math.trunc(personId)}`;
  }

  return 'user:anonymous';
}

export function buildRequestCacheKey(config = {}) {
  const method = normalizeMethod(config.method);
  const path = sanitizePath(config.url);
  const params = normalizeParams(config.params);
  const paramsKey = JSON.stringify(params);

  return `${method} ${path}?${paramsKey}`;
}

export async function getCachedApiResponse(config = {}) {
  const db = await getOfflineDb();
  const scopeKey = getOfflineScopeKey();
  const requestKey = buildRequestCacheKey(config);
  const cacheKey = `${scopeKey}::${requestKey}`;

  return db.get(API_CACHE_STORE, cacheKey);
}

export async function getCachedApiResponseByPath(config = {}) {
  const db = await getOfflineDb();
  const scopeKey = getOfflineScopeKey();
  const method = normalizeMethod(config.method);
  const path = sanitizePath(config.url);
  const index = db.transaction(API_CACHE_STORE).store.index('byScopeKey');
  const rows = await index.getAll(scopeKey);
  let bestMatch = null;
  let bestUpdatedAt = 0;

  for (const row of rows || []) {
    if (normalizeMethod(row?.method) !== method) {
      continue;
    }

    if (sanitizePath(row?.path) !== path) {
      continue;
    }

    const updatedAt = Date.parse(String(row?.updatedAt || '')) || 0;

    if (!bestMatch || updatedAt >= bestUpdatedAt) {
      bestMatch = row;
      bestUpdatedAt = updatedAt;
    }
  }

  return bestMatch;
}

export async function countCachedResponsesForCurrentScope() {
  const db = await getOfflineDb();
  const scopeKey = getOfflineScopeKey();
  const tx = db.transaction(API_CACHE_STORE, 'readonly');
  const index = tx.store.index('byScopeKey');
  const total = await index.count(scopeKey);
  await tx.done;
  return Number(total || 0);
}

export async function hasCachedResponseForPath(path, method = 'GET') {
  const normalizedPath = sanitizePath(path);
  const normalizedMethod = normalizeMethod(method);
  const db = await getOfflineDb();
  const scopeKey = getOfflineScopeKey();
  const tx = db.transaction(API_CACHE_STORE, 'readonly');
  const index = tx.store.index('byScopeKey');
  const rows = await index.getAll(scopeKey);
  await tx.done;

  return (rows || []).some(
    (row) =>
      normalizeMethod(row?.method) === normalizedMethod &&
      sanitizePath(row?.path) === normalizedPath
  );
}

export async function setCachedApiResponse(config = {}, response = {}) {
  const db = await getOfflineDb();
  const scopeKey = getOfflineScopeKey();
  const requestKey = buildRequestCacheKey(config);
  const cacheKey = `${scopeKey}::${requestKey}`;
  const nowIso = new Date().toISOString();

  await db.put(API_CACHE_STORE, {
    cacheKey,
    scopeKey,
    requestKey,
    method: normalizeMethod(config.method),
    path: sanitizePath(config.url),
    params: toSerializable(config.params, {}),
    data: toSerializable(response.data, null),
    status: Number(response.status || 200),
    headers: sanitizeHeaders(response.headers),
    updatedAt: nowIso
  });
}

export async function clearApiCacheForCurrentScope() {
  const db = await getOfflineDb();
  const scopeKey = getOfflineScopeKey();
  const tx = db.transaction(API_CACHE_STORE, 'readwrite');
  const store = tx.objectStore(API_CACHE_STORE);
  const all = await store.getAll();

  for (const row of all || []) {
    if (String(row?.scopeKey || '') !== scopeKey) {
      continue;
    }

    await store.delete(row.cacheKey);
  }

  await tx.done;
}

export async function enqueueOfflineMutation(config = {}) {
  const db = await getOfflineDb();
  const scopeKey = getOfflineScopeKey();
  const method = normalizeMethod(config.method);
  const path = sanitizePath(config.url);
  const params = toSerializable(config.params, {});
  const data = toSerializable(config.data, null);
  const headers = sanitizeHeaders(config.headers);

  return db.add(API_MUTATIONS_STORE, {
    scopeKey,
    method,
    path,
    params,
    data,
    headers,
    queuedAt: new Date().toISOString(),
    attempts: 0,
    lastAttemptAt: null,
    lastError: ''
  });
}

export async function listQueuedMutationsForCurrentScope() {
  const db = await getOfflineDb();
  const scopeKey = getOfflineScopeKey();
  const all = await db.getAll(API_MUTATIONS_STORE);

  return (all || [])
    .filter((item) => String(item?.scopeKey || '') === scopeKey)
    .sort((left, right) => Number(left?.id || 0) - Number(right?.id || 0));
}

export async function removeQueuedMutation(id) {
  const mutationId = Number(id);

  if (!Number.isFinite(mutationId) || mutationId <= 0) {
    return;
  }

  const db = await getOfflineDb();
  await db.delete(API_MUTATIONS_STORE, mutationId);
}

export async function markQueuedMutationAttempt(id, error) {
  const mutationId = Number(id);

  if (!Number.isFinite(mutationId) || mutationId <= 0) {
    return;
  }

  const db = await getOfflineDb();
  const current = await db.get(API_MUTATIONS_STORE, mutationId);

  if (!current) {
    return;
  }

  const details =
    String(error?.response?.data?.message || '').trim() ||
    String(error?.message || '').trim() ||
    'Request failed';

  await db.put(API_MUTATIONS_STORE, {
    ...current,
    attempts: Number(current.attempts || 0) + 1,
    lastAttemptAt: new Date().toISOString(),
    lastError: details.slice(0, 400)
  });
}

export async function countQueuedMutationsForCurrentScope() {
  const list = await listQueuedMutationsForCurrentScope();
  return list.length;
}
