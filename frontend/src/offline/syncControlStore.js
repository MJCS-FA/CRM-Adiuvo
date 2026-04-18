import { getOfflineDb } from './db';

const SYNC_CONTROL_STORE = 'localTblControlSincronizacion';
const PERSONAS_STORE = 'localTblPersonas';

function toPersonaCode(value) {
  if (typeof value === 'object' && value !== null) {
    const fromUser = Number(value.codPersonas || value.personaId || value.id || 0);
    return Number.isFinite(fromUser) && fromUser > 0 ? Math.trunc(fromUser) : 0;
  }

  const parsed = Number(value || 0);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : 0;
}

function toIsoNow() {
  return new Date().toISOString();
}

function getMonthFromIso(isoValue) {
  const date = new Date(String(isoValue || '').trim());

  if (Number.isNaN(date.getTime())) {
    return 0;
  }

  return date.getMonth() + 1;
}

function getYearFromIso(isoValue) {
  const date = new Date(String(isoValue || '').trim());

  if (Number.isNaN(date.getTime())) {
    return 0;
  }

  return date.getFullYear();
}

function isSameDay(isoValue, referenceDate = new Date()) {
  const date = new Date(String(isoValue || '').trim());

  if (Number.isNaN(date.getTime())) {
    return false;
  }

  return (
    date.getFullYear() === referenceDate.getFullYear() &&
    date.getMonth() === referenceDate.getMonth() &&
    date.getDate() === referenceDate.getDate()
  );
}

function diffHoursSince(isoValue, referenceDate = new Date()) {
  const date = new Date(String(isoValue || '').trim());

  if (Number.isNaN(date.getTime())) {
    return Number.POSITIVE_INFINITY;
  }

  const diffMs = referenceDate.getTime() - date.getTime();

  if (!Number.isFinite(diffMs)) {
    return Number.POSITIVE_INFINITY;
  }

  return Math.max(0, diffMs / (1000 * 60 * 60));
}

function buildDefaultSyncControl(codigoPersona) {
  return {
    Id: codigoPersona,
    CodigoPersona: codigoPersona,
    FechaUltimoLogin: '',
    FechaUltimaSincronizacion: '',
    SincronizoHoy: false,
    MesSincronizacion: 0,
    AnioSincronizacion: 0,
    EstadoSincronizacion: 'pending',
    ObservacionError: '',
    UpdatedAt: ''
  };
}

export function evaluateSyncControlRecord(record, referenceDate = new Date()) {
  const fechaUltimaSincronizacion = String(record?.FechaUltimaSincronizacion || '').trim();
  const estado = String(record?.EstadoSincronizacion || '').trim().toLowerCase();
  const mesActual = referenceDate.getMonth() + 1;
  const anioActual = referenceDate.getFullYear();
  const syncedTodayByDate = isSameDay(fechaUltimaSincronizacion, referenceDate);
  const syncedTodayByFields =
    Number(record?.MesSincronizacion || 0) === mesActual &&
    Number(record?.AnioSincronizacion || 0) === anioActual &&
    Boolean(record?.SincronizoHoy);
  const syncSuccess = estado === 'success';
  const syncedToday = syncSuccess && syncedTodayByDate && syncedTodayByFields;
  const hoursSinceLastSync = diffHoursSince(fechaUltimaSincronizacion, referenceDate);

  return {
    syncedToday,
    syncSuccess,
    hasLastSync: Boolean(fechaUltimaSincronizacion),
    fechaUltimaSincronizacion,
    hoursSinceLastSync,
    within24Hours: Number.isFinite(hoursSinceLastSync) && hoursSinceLastSync <= 24
  };
}

export async function getSyncControlByPersona(codigoPersonaOrUser) {
  const codigoPersona = toPersonaCode(codigoPersonaOrUser);

  if (!codigoPersona) {
    return null;
  }

  const db = await getOfflineDb();
  const row = await db.get(SYNC_CONTROL_STORE, codigoPersona);

  if (!row) {
    return null;
  }

  return {
    ...buildDefaultSyncControl(codigoPersona),
    ...row
  };
}

export async function upsertSyncControl(codigoPersonaOrUser, patch = {}) {
  const codigoPersona = toPersonaCode(codigoPersonaOrUser);

  if (!codigoPersona) {
    return null;
  }

  const db = await getOfflineDb();
  const existing = await db.get(SYNC_CONTROL_STORE, codigoPersona);
  const base = existing
    ? {
        ...buildDefaultSyncControl(codigoPersona),
        ...existing
      }
    : buildDefaultSyncControl(codigoPersona);

  const next = {
    ...base,
    ...patch,
    Id: codigoPersona,
    CodigoPersona: codigoPersona,
    UpdatedAt: toIsoNow()
  };

  await db.put(SYNC_CONTROL_STORE, next);
  return next;
}

export async function markSyncInProgress(codigoPersonaOrUser) {
  const nowIso = toIsoNow();

  return upsertSyncControl(codigoPersonaOrUser, {
    FechaUltimoLogin: nowIso,
    EstadoSincronizacion: 'in_progress',
    ObservacionError: ''
  });
}

export async function markSyncSuccess(codigoPersonaOrUser) {
  const nowIso = toIsoNow();

  return upsertSyncControl(codigoPersonaOrUser, {
    FechaUltimoLogin: nowIso,
    FechaUltimaSincronizacion: nowIso,
    SincronizoHoy: true,
    MesSincronizacion: getMonthFromIso(nowIso),
    AnioSincronizacion: getYearFromIso(nowIso),
    EstadoSincronizacion: 'success',
    ObservacionError: ''
  });
}

export async function markSyncError(codigoPersonaOrUser, errorMessage) {
  const nowIso = toIsoNow();
  const message = String(errorMessage || '').trim().slice(0, 600);

  return upsertSyncControl(codigoPersonaOrUser, {
    FechaUltimoLogin: nowIso,
    EstadoSincronizacion: 'error',
    ObservacionError: message
  });
}

export async function registerUserOnlineLogin(codigoPersonaOrUser, user = null) {
  const userSource =
    typeof codigoPersonaOrUser === 'object' && codigoPersonaOrUser !== null
      ? codigoPersonaOrUser
      : user || {};
  const codigoPersona = toPersonaCode(codigoPersonaOrUser || userSource);

  if (!codigoPersona) {
    return null;
  }

  const nowIso = toIsoNow();
  const db = await getOfflineDb();
  const existing = await db.get(PERSONAS_STORE, codigoPersona);
  const nombre =
    String(userSource.displayName || userSource.nombre || userSource.nombreCompleto || '').trim();
  const username =
    String(userSource.username || userSource.email || userSource.usuario || '').trim();

  const next = {
    Id: codigoPersona,
    CodigoPersona: codigoPersona,
    Nombre: nombre || existing?.Nombre || '',
    Username: username || existing?.Username || '',
    FechaUltimoLogin: nowIso,
    FechaUltimaSincronizacion: String(existing?.FechaUltimaSincronizacion || '').trim(),
    UpdatedAt: nowIso
  };

  await db.put(PERSONAS_STORE, next);

  await upsertSyncControl(codigoPersona, {
    FechaUltimoLogin: nowIso
  });

  return next;
}

export async function updateUserLastSyncDate(codigoPersonaOrUser, syncAtIso = '') {
  const codigoPersona = toPersonaCode(codigoPersonaOrUser);

  if (!codigoPersona) {
    return;
  }

  const db = await getOfflineDb();
  const existing = await db.get(PERSONAS_STORE, codigoPersona);
  const nowIso = toIsoNow();

  if (!existing) {
    await db.put(PERSONAS_STORE, {
      Id: codigoPersona,
      CodigoPersona: codigoPersona,
      Nombre: '',
      Username: '',
      FechaUltimoLogin: nowIso,
      FechaUltimaSincronizacion: String(syncAtIso || nowIso).trim(),
      UpdatedAt: nowIso
    });
    return;
  }

  await db.put(PERSONAS_STORE, {
    ...existing,
    FechaUltimaSincronizacion: String(syncAtIso || nowIso).trim(),
    UpdatedAt: nowIso
  });
}

