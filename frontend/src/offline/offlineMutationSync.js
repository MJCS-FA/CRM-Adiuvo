import { httpClient } from '../services/httpClient';
import {
  countQueuedMutationsForCurrentScope,
  listQueuedMutationsForCurrentScope,
  markQueuedMutationAttempt,
  removeQueuedMutation
} from './apiOfflineStore';

let autoSyncInitialized = false;
let syncInProgress = false;
let scheduledSyncTimer = null;

function canUseNavigator() {
  return typeof navigator !== 'undefined';
}

function isOnline() {
  if (!canUseNavigator()) {
    return true;
  }

  return navigator.onLine;
}

function scheduleSync(delayMs = 500) {
  if (scheduledSyncTimer) {
    window.clearTimeout(scheduledSyncTimer);
  }

  scheduledSyncTimer = window.setTimeout(() => {
    scheduledSyncTimer = null;
    syncPendingOfflineMutations();
  }, Math.max(0, Number(delayMs) || 0));
}

function buildSyncHeaders(source = {}) {
  return {
    ...source,
    'x-offline-sync': '1'
  };
}

function isRetryableStatus(statusCode) {
  const status = Number(statusCode || 0);

  if (!status) {
    return true;
  }

  if (status === 408 || status === 425 || status === 429) {
    return true;
  }

  if (status >= 500) {
    return true;
  }

  return false;
}

function notifyProgress(handler, payload = {}) {
  if (typeof handler !== 'function') {
    return;
  }

  try {
    handler(payload);
  } catch {
    // Ignore progress callback errors to keep sync stable.
  }
}

export async function syncPendingOfflineMutations(options = {}) {
  const onProgress = options?.onProgress;

  if (syncInProgress || !isOnline()) {
    const total = await countQueuedMutationsForCurrentScope();
    notifyProgress(onProgress, {
      phase: 'skipped',
      total,
      processed: 0,
      synced: 0,
      failed: 0,
      discarded: 0,
      pending: total
    });

    return {
      total,
      synced: 0,
      failed: 0,
      discarded: 0,
      skipped: true
    };
  }

  syncInProgress = true;

  try {
    const queue = await listQueuedMutationsForCurrentScope();
    let synced = 0;
    let failed = 0;
    let discarded = 0;
    let processed = 0;

    notifyProgress(onProgress, {
      phase: 'start',
      total: queue.length,
      processed,
      synced,
      failed,
      discarded,
      pending: queue.length
    });

    for (const mutation of queue) {
      try {
        await httpClient.request({
          method: mutation.method,
          url: mutation.path,
          params: mutation.params || {},
          data: mutation.data,
          headers: buildSyncHeaders(mutation.headers || {})
        });

        await removeQueuedMutation(mutation.id);
        synced += 1;
        processed += 1;

        notifyProgress(onProgress, {
          phase: 'progress',
          total: queue.length,
          processed,
          synced,
          failed,
          discarded,
          pending: Math.max(0, queue.length - processed)
        });
      } catch (error) {
        const statusCode = Number(error?.response?.status || 0);

        if (!isRetryableStatus(statusCode)) {
          await removeQueuedMutation(mutation.id);
          discarded += 1;
          processed += 1;

          notifyProgress(onProgress, {
            phase: 'progress',
            total: queue.length,
            processed,
            synced,
            failed,
            discarded,
            pending: Math.max(0, queue.length - processed)
          });
          continue;
        }

        await markQueuedMutationAttempt(mutation.id, error);
        failed += 1;
        processed += 1;

        notifyProgress(onProgress, {
          phase: 'progress',
          total: queue.length,
          processed,
          synced,
          failed,
          discarded,
          pending: Math.max(0, queue.length - processed)
        });

        if (!statusCode) {
          break;
        }
      }
    }

    const pending = await countQueuedMutationsForCurrentScope();

    return {
      total: queue.length,
      processed,
      synced,
      failed,
      discarded,
      pending
    };
  } finally {
    syncInProgress = false;
  }
}

export function startOfflineMutationAutoSync() {
  if (autoSyncInitialized || typeof window === 'undefined') {
    return;
  }

  autoSyncInitialized = true;

  window.addEventListener('online', () => scheduleSync(200));
  window.addEventListener('focus', () => scheduleSync(350));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      scheduleSync(500);
    }
  });
}

export function triggerOfflineMutationSync() {
  if (!isOnline()) {
    return;
  }

  scheduleSync(120);
}
