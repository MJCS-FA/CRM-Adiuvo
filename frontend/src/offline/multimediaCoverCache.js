import { multimediaService } from '../services/multimediaService';
import { getOfflineDb } from './db';

const MULTIMEDIA_COVER_STORE = 'multimediaCoverCache';
const DEFAULT_CACHE_TIMEOUT_MS = 12000;
const MAX_DATA_URL_LENGTH = 2_000_000;
const PORTADA_TABLE = 'BinarioPortadaMultimedia';

function canUseNavigator() {
  return typeof navigator !== 'undefined';
}

function isOnline() {
  if (!canUseNavigator()) {
    return true;
  }

  return navigator.onLine;
}

export function normalizeMultimediaS3Key(value) {
  const text = String(value || '').trim();

  if (!text) {
    return '';
  }

  let normalized = text.replace(/^['"]+|['"]+$/g, '').trim();

  if (/^https?:\/\//i.test(normalized)) {
    try {
      const parsed = new URL(normalized);
      normalized = parsed.pathname || '';
    } catch {
      normalized = normalized.replace(/^https?:\/\/[^/]+\/?/i, '');
    }
  }

  return normalized.replace(/^\/+/, '').split('?')[0].trim();
}

function normalizeUrl(value) {
  const text = String(value || '').trim();
  return /^https?:\/\//i.test(text) ? text : '';
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      resolve(String(reader.result || ''));
    };

    reader.onerror = () => {
      reject(new Error('No se pudo convertir la portada a formato local.'));
    };

    reader.readAsDataURL(blob);
  });
}

export async function getCachedMultimediaCoverData(s3Key) {
  const normalizedKey = normalizeMultimediaS3Key(s3Key);

  if (!normalizedKey) {
    return '';
  }

  const db = await getOfflineDb();
  const cached = await db.get(MULTIMEDIA_COVER_STORE, normalizedKey);
  return String(cached?.dataUrl || '').trim();
}

export async function getCachedMultimediaCoverMap(keys = []) {
  const uniqueKeys = [...new Set((keys || []).map((item) => normalizeMultimediaS3Key(item)).filter(Boolean))];

  if (!uniqueKeys.length) {
    return {};
  }

  const db = await getOfflineDb();
  const result = {};

  await Promise.all(
    uniqueKeys.map(async (s3Key) => {
      const cached = await db.get(MULTIMEDIA_COVER_STORE, s3Key);
      const dataUrl = String(cached?.dataUrl || '').trim();

      if (dataUrl) {
        result[s3Key] = dataUrl;
      }
    })
  );

  return result;
}

export async function setCachedMultimediaCoverData(s3Key, dataUrl) {
  const normalizedKey = normalizeMultimediaS3Key(s3Key);
  const normalizedDataUrl = String(dataUrl || '').trim();

  if (!normalizedKey || !normalizedDataUrl) {
    return '';
  }

  const db = await getOfflineDb();
  await db.put(MULTIMEDIA_COVER_STORE, {
    s3Key: normalizedKey,
    dataUrl: normalizedDataUrl,
    updatedAt: new Date().toISOString()
  });

  return normalizedDataUrl;
}

export async function cacheMultimediaCoverFromRemote({
  s3Key,
  sourceUrl,
  timeoutMs = DEFAULT_CACHE_TIMEOUT_MS
} = {}) {
  const normalizedKey = normalizeMultimediaS3Key(s3Key);
  const normalizedUrl = normalizeUrl(sourceUrl);

  if (!normalizedKey || !normalizedUrl) {
    return '';
  }

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timerApi = typeof window !== 'undefined' ? window : globalThis;
  const timerId = controller
    ? timerApi.setTimeout(
        () => controller.abort(),
        Math.max(2000, Number(timeoutMs) || DEFAULT_CACHE_TIMEOUT_MS)
      )
    : null;

  try {
    const response = await fetch(normalizedUrl, {
      method: 'GET',
      mode: 'cors',
      signal: controller?.signal
    });

    if (!response.ok) {
      throw new Error(`Cover fetch failed: ${response.status}`);
    }

    const blob = await response.blob();

    if (!String(blob?.type || '').toLowerCase().startsWith('image/')) {
      throw new Error('Cover response is not an image.');
    }

    const dataUrl = await blobToDataUrl(blob);

    if (!dataUrl || dataUrl.length > MAX_DATA_URL_LENGTH) {
      throw new Error('Cover is too large for offline cache.');
    }

    await setCachedMultimediaCoverData(normalizedKey, dataUrl);
    return dataUrl;
  } finally {
    if (timerId) {
      timerApi.clearTimeout(timerId);
    }
  }
}

export async function prefetchMultimediaCoverCache(items = [], { limit = 24 } = {}) {
  if (!isOnline()) {
    return {
      total: 0,
      cached: 0,
      failed: 0,
      skipped: 0
    };
  }

  const uniqueKeys = [
    ...new Set(
      (items || [])
        .map((item) => normalizeMultimediaS3Key(item?.s3KeyPortada))
        .filter(Boolean)
    )
  ].slice(0, Math.max(0, Number(limit) || 0));

  if (!uniqueKeys.length) {
    return {
      total: 0,
      cached: 0,
      failed: 0,
      skipped: 0
    };
  }

  let cached = 0;
  let failed = 0;
  let skipped = 0;

  for (const s3Key of uniqueKeys) {
    try {
      const existing = await getCachedMultimediaCoverData(s3Key);

      if (existing) {
        skipped += 1;
        continue;
      }

      const resolved = await multimediaService.resolveFileUrl({
        s3Key,
        nombreTabla: PORTADA_TABLE
      });
      const sourceUrl = normalizeUrl(resolved?.url || resolved?.URL);

      if (!sourceUrl) {
        failed += 1;
        continue;
      }

      await cacheMultimediaCoverFromRemote({
        s3Key,
        sourceUrl
      });
      cached += 1;
    } catch {
      failed += 1;
    }
  }

  return {
    total: uniqueKeys.length,
    cached,
    failed,
    skipped
  };
}
