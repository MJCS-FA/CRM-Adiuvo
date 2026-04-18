import { calendarService } from '../services/calendarService';
import { directoryService } from '../services/directoryService';
import { homeService } from '../services/homeService';
import { inventoryService } from '../services/inventoryService';
import { multimediaService } from '../services/multimediaService';
import { visitService } from '../services/visitService';
import {
  countCachedResponsesForCurrentScope,
  countQueuedMutationsForCurrentScope,
  hasCachedResponseForPath
} from './apiOfflineStore';
import { syncPendingOfflineMutations } from './offlineMutationSync';
import { getPendingMutationsCount } from './queue';
import {
  evaluateSyncControlRecord,
  getSyncControlByPersona,
  markSyncError,
  markSyncInProgress,
  markSyncSuccess,
  registerUserOnlineLogin,
  updateUserLastSyncDate,
  upsertSyncControl
} from './syncControlStore';
import { syncPendingVisits } from './syncManager';

export const OFFLINE_BLOCK_MESSAGE =
  'Tu aplicaci\u00f3n no se ha actualizado en m\u00e1s de 24 horas. Con\u00e9ctate a internet para sincronizar y continuar';

export const OFFLINE_RECENT_PROMPT_MESSAGE =
  'No tienes conexi\u00f3n a internet. \u00bfDeseas continuar con la \u00faltima informaci\u00f3n sincronizada?';

// Bypass temporal desactivado para retomar las pruebas reales de sincronizacion.
const TEMPORARY_SYNC_BYPASS = false;

const REQUIRED_CACHE_PATHS = [
  '/home/overview',
  '/directory/medicos',
  '/directory/sucursales',
  '/calendar/catalogs/tipos-visita',
  '/calendar/visits',
  '/inventory/bootstrap',
  '/multimedia/bootstrap',
  '/multimedia/items'
];

const INITIAL_STEP_HEARTBEAT_MS = 850;

function canUseNavigator() {
  return typeof navigator !== 'undefined';
}

function canUseWindow() {
  return typeof window !== 'undefined';
}

function readBooleanFlag(value) {
  const normalized = String(value ?? '').trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

export function isSyncBypassed() {
  if (TEMPORARY_SYNC_BYPASS) {
    return true;
  }

  if (canUseWindow()) {
    try {
      const localFlag = window.localStorage.getItem('app.sync.bypass');
      if (localFlag != null) {
        return readBooleanFlag(localFlag);
      }
    } catch {
      // Ignore localStorage access errors.
    }
  }

  return readBooleanFlag(import.meta?.env?.VITE_BYPASS_SYNC);
}

export function isAppOnline() {
  if (!canUseNavigator()) {
    return true;
  }

  return navigator.onLine;
}

function getCurrentMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function getTodayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate()
  ).padStart(2, '0')}`;
}

function normalizeDateKey(value) {
  const text = String(value || '').trim();
  return text ? text.slice(0, 10) : '';
}

function notifyProgress(handler, payload = {}) {
  if (typeof handler !== 'function') {
    return;
  }

  try {
    handler(payload);
  } catch {
    // Ignore UI progress callback errors.
  }
}

function toPersonaCode(user) {
  const parsed = Number(user?.codPersonas || user?.personaId || user?.id || 0);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : 0;
}

function stepDetail(stepIndex, total, label, done = false) {
  const prefix = `Tabla ${stepIndex} de ${total}`;
  if (done) {
    return `${prefix}: ${label} completada`;
  }

  return `${prefix}: ${label} sincronizando`;
}

function startStepHeartbeat({
  onProgress,
  stepIndex,
  total,
  label,
  startPercent,
  donePercent
}) {
  const minMargin = Math.max(1, Math.round((donePercent - startPercent) * 0.2));
  const maxPercent = Math.max(startPercent, donePercent - minMargin);
  let currentPercent = startPercent;

  notifyProgress(onProgress, {
    phase: 'initial',
    status: 'running',
    title: 'Sincronizando informacion inicial...',
    detail: stepDetail(stepIndex, total, label, false),
    total,
    completed: stepIndex - 1,
    percent: currentPercent
  });

  if (typeof window === 'undefined') {
    return () => {};
  }

  const increase = Math.max(0.35, (donePercent - startPercent) / 11);
  const timer = window.setInterval(() => {
    if (currentPercent >= maxPercent) {
      return;
    }

    currentPercent = Math.min(maxPercent, currentPercent + increase);

    notifyProgress(onProgress, {
      phase: 'initial',
      status: 'running',
      title: 'Sincronizando informacion inicial...',
      detail: stepDetail(stepIndex, total, label, false),
      total,
      completed: stepIndex - 1,
      percent: Math.round(currentPercent)
    });
  }, INITIAL_STEP_HEARTBEAT_MS);

  return () => {
    window.clearInterval(timer);
  };
}

function buildMandatoryInitialSyncSteps() {
  const monthKey = getCurrentMonthKey();

  return [
    {
      table: 'home_overview',
      label: 'Dashboard',
      required: true,
      run: async () => {
        await homeService.getOverview();
      }
    },
    {
      table: 'directory_doctors',
      label: 'Directorio de medicos',
      required: true,
      run: async () => {
        await directoryService.getDoctors();
      }
    },
    {
      table: 'directory_branches',
      label: 'Directorio de sucursales',
      required: true,
      run: async () => {
        await directoryService.getBranches();
      }
    },
    {
      table: 'calendar_visit_types',
      label: 'Catalogo de visitas',
      required: true,
      run: async () => {
        await calendarService.getVisitTypes();
      }
    },
    {
      table: 'calendar_visits',
      label: 'Calendario del mes actual',
      required: true,
      run: async () => {
        await calendarService.getMonthVisits(monthKey);
      }
    },
    {
      table: 'inventory_bootstrap',
      label: 'Inventario base',
      required: true,
      run: async () => {
        await inventoryService.getBootstrap();
      }
    },
    {
      table: 'multimedia_bootstrap',
      label: 'Catalogo multimedia',
      required: true,
      run: async () => {
        await multimediaService.getBootstrap();
      }
    },
    {
      table: 'multimedia_items',
      label: 'Archivos multimedia',
      required: true,
      run: async () => {
        await multimediaService.getItems({
          codigoTipoMultimedia: 0,
          buscar: ''
        });
      }
    }
  ];
}

function buildBackgroundWarmupSteps() {
  const today = getTodayKey();

  return [
    {
      table: 'directory_visitador',
      label: 'Visitador',
      run: async () => {
        await directoryService.getVisitador();
      }
    },
    {
      table: 'directory_hospitals',
      label: 'Hospitales',
      run: async () => {
        await directoryService.getHospitals();
      }
    },
    {
      table: 'directory_specialties',
      label: 'Especialidades',
      run: async () => {
        await directoryService.getSpecialties();
      }
    },
    {
      table: 'directory_categories',
      label: 'Categorias',
      run: async () => {
        await directoryService.getCategories();
      }
    },
    {
      table: 'directory_branch_catalog',
      label: 'Catalogo de sucursales',
      run: async () => {
        await directoryService.getBranchCatalog();
      }
    },
    {
      table: 'calendar_visit_channels',
      label: 'Canales de visita',
      run: async () => {
        await calendarService.getVisitChannels();
      }
    },
    {
      table: 'calendar_assigned_doctors',
      label: 'Medicos asignados',
      run: async () => {
        await calendarService.getAssignedDoctors();
      }
    },
    {
      table: 'calendar_assigned_branches',
      label: 'Sucursales asignadas',
      run: async () => {
        await calendarService.getAssignedBranches();
      }
    },
    {
      table: 'calendar_cancel_reasons',
      label: 'Motivos de cancelacion',
      run: async () => {
        await calendarService.getCancellationReasons();
      }
    },
    {
      table: 'inventory_orders_bootstrap',
      label: 'Inventario ordenes base',
      run: async () => {
        await inventoryService.getOrdersBootstrap();
      }
    },
    {
      table: 'inventory_orders_entradas',
      label: 'Ordenes de entrada',
      run: async () => {
        await inventoryService.getOrders({
          tab: 'entradas',
          fechaInicio: today,
          fechaFinal: today
        });
      }
    },
    {
      table: 'inventory_orders_salidas',
      label: 'Ordenes de salida',
      run: async () => {
        await inventoryService.getOrders({
          tab: 'salidas',
          fechaInicio: today,
          fechaFinal: today
        });
      }
    },
    {
      table: 'inventory_requests_bootstrap',
      label: 'Solicitudes de inventario',
      run: async () => {
        await inventoryService.getRequestsBootstrap();
      }
    },
    {
      table: 'inventory_requests',
      label: 'Detalle de solicitudes',
      run: async () => {
        let fechaInicio = today;
        let fechaFinal = today;

        try {
          const requestBootstrap = await inventoryService.getRequestsBootstrap();
          fechaInicio = normalizeDateKey(requestBootstrap?.filtros?.fechaInicio) || today;
          fechaFinal = normalizeDateKey(requestBootstrap?.filtros?.fechaFinal) || today;
        } catch {
          // Keep default dates.
        }

        await inventoryService.getRequests({
          fechaInicio,
          fechaFinal,
          buscar: ''
        });
      }
    },
    {
      table: 'visits_list',
      label: 'Listado de visitas',
      run: async () => {
        await visitService.list();
      }
    }
  ];
}

export async function getPendingSyncCounts() {
  const [apiPending, legacyPending] = await Promise.all([
    countQueuedMutationsForCurrentScope(),
    getPendingMutationsCount()
  ]);

  const normalizedApi = Number(apiPending || 0);
  const normalizedLegacy = Number(legacyPending || 0);

  return {
    apiPending: normalizedApi,
    legacyPending: normalizedLegacy,
    total: normalizedApi + normalizedLegacy
  };
}

export async function checkInitialOfflineReadiness(user) {
  const syncControl = await getSyncControlByPersona(user);
  const syncStatus = evaluateSyncControlRecord(syncControl || {});
  const [cacheCount, pathChecks] = await Promise.all([
    countCachedResponsesForCurrentScope(),
    Promise.all(
      REQUIRED_CACHE_PATHS.map(async (path) => ({
        path,
        exists: await hasCachedResponseForPath(path, 'GET')
      }))
    )
  ]);

  const missingPaths = pathChecks.filter((item) => !item.exists).map((item) => item.path);
  const hasBaseDataReady = syncStatus.hasLastSync && cacheCount > 0 && missingPaths.length === 0;
  const needsInitialSync = !hasBaseDataReady;
  const needsCatalogRefresh = hasBaseDataReady && !syncStatus.syncedToday;

  return {
    hasBaseDataReady,
    needsInitialSync,
    needsCatalogRefresh,
    cacheCount,
    missingPaths,
    syncControl,
    syncStatus
  };
}

export async function evaluateAccessRequirements(user, online) {
  const isOnline = typeof online === 'boolean' ? online : isAppOnline();

  if (isOnline) {
    await registerUserOnlineLogin(user, user);
    const readiness = await checkInitialOfflineReadiness(user);

    return {
      mode: 'online',
      shouldRunMandatorySync: readiness.needsInitialSync,
      shouldRunCatalogRefresh: readiness.needsCatalogRefresh,
      ...readiness
    };
  }

  const readiness = await checkInitialOfflineReadiness(user);
  const shouldBlock =
    !readiness.syncStatus.hasLastSync ||
    !readiness.syncStatus.within24Hours ||
    !readiness.hasBaseDataReady;

  return {
    mode: shouldBlock ? 'offline_block' : 'offline_prompt',
    message: shouldBlock ? OFFLINE_BLOCK_MESSAGE : OFFLINE_RECENT_PROMPT_MESSAGE,
    shouldRunMandatorySync: false,
    ...readiness
  };
}

let mandatorySyncInFlight = null;
let warmupSyncInFlight = null;

function queueWarmupSync(user) {
  if (!isAppOnline()) {
    return Promise.resolve({ skipped: true });
  }

  if (warmupSyncInFlight) {
    return warmupSyncInFlight;
  }

  const steps = buildBackgroundWarmupSteps();
  warmupSyncInFlight = (async () => {
    for (let index = 0; index < steps.length; index += 1) {
      const step = steps[index];

      try {
        await step.run();
      } catch {
        // Warmup is best-effort and should never block user flow.
      }
    }

    const codigoPersona = toPersonaCode(user);

    if (codigoPersona) {
      await updateUserLastSyncDate(codigoPersona, new Date().toISOString());
    }

    return { skipped: false, total: steps.length };
  })();

  warmupSyncInFlight.finally(() => {
    warmupSyncInFlight = null;
  });

  return warmupSyncInFlight;
}

export async function runMandatoryInitialSync(user, options = {}) {
  if (mandatorySyncInFlight) {
    return mandatorySyncInFlight;
  }

  if (!isAppOnline()) {
    const error = new Error('No hay conexion disponible para sincronizar.');
    error.code = 'OFFLINE_UNAVAILABLE';
    throw error;
  }

  const codigoPersona = toPersonaCode(user);

  if (!codigoPersona) {
    throw new Error('No se encontro el usuario para registrar sincronizacion.');
  }

  const onProgress = options?.onProgress;
  mandatorySyncInFlight = (async () => {
    const steps = buildMandatoryInitialSyncSteps();
    const total = steps.length;
    const requiredErrors = [];
    const optionalErrors = [];
    let completed = 0;

    await registerUserOnlineLogin(user, user);
    await markSyncInProgress(codigoPersona);

    for (let index = 0; index < steps.length; index += 1) {
      const step = steps[index];
      const stepIndex = index + 1;
      const startPercent = total ? Math.round((completed / total) * 100) : 0;
      const donePercent = total ? Math.round((stepIndex / total) * 100) : 100;
      const stopHeartbeat = startStepHeartbeat({
        onProgress,
        stepIndex,
        total,
        label: step.label,
        startPercent,
        donePercent
      });

      try {
        await step.run();
      } catch (error) {
        if (step.required) {
          requiredErrors.push({
            table: step.table,
            label: step.label,
            error
          });
          stopHeartbeat();
          completed += 1;

          notifyProgress(onProgress, {
            phase: 'initial',
            status: 'running',
            title: 'Sincronizando informacion inicial...',
            detail: stepDetail(stepIndex, total, step.label, true),
            table: step.table,
            total,
            completed,
            percent: donePercent
          });
          break;
        }

        optionalErrors.push({
          table: step.table,
          label: step.label,
          error
        });
      } finally {
        stopHeartbeat();
      }

      completed += 1;

      notifyProgress(onProgress, {
        phase: 'initial',
        status: 'running',
        title: 'Sincronizando informacion inicial...',
        detail: stepDetail(stepIndex, total, step.label, true),
        table: step.table,
        total,
        completed,
        percent: donePercent
      });
    }

    const readiness = await checkInitialOfflineReadiness(user);

    if (requiredErrors.length > 0 || !readiness.hasBaseDataReady) {
      const missingText = readiness.missingPaths.length
        ? `Faltan datos en cache: ${readiness.missingPaths.join(', ')}`
        : '';
      const firstError = requiredErrors[0]?.error;
      const reason = String(
        firstError?.message || missingText || 'No se pudo completar la sincronizacion inicial.'
      );

      await markSyncError(codigoPersona, reason);

      const syncError = new Error(reason);
      syncError.code = 'INITIAL_SYNC_FAILED';
      syncError.requiredErrors = requiredErrors;
      syncError.optionalErrors = optionalErrors;
      syncError.readiness = readiness;
      throw syncError;
    }

    await markSyncSuccess(codigoPersona);
    await updateUserLastSyncDate(codigoPersona, new Date().toISOString());

    notifyProgress(onProgress, {
      phase: 'initial',
      status: 'completed',
      title: 'Sincronizacion completada',
      detail: `${completed} de ${total} tablas procesadas`,
      percent: 100,
      total,
      completed
    });

    return {
      success: true,
      totalTables: total,
      completedTables: completed,
      requiredErrors,
      optionalErrors,
      readiness: await checkInitialOfflineReadiness(user)
    };
  })();

  try {
    return await mandatorySyncInFlight;
  } finally {
    mandatorySyncInFlight = null;
  }
}

export async function runPendingOfflineSync(user, options = {}) {
  if (!isAppOnline()) {
    const error = new Error('No hay conexion disponible para sincronizar.');
    error.code = 'OFFLINE_UNAVAILABLE';
    throw error;
  }

  const codigoPersona = toPersonaCode(user);
  const onProgress = options?.onProgress;
  const pending = await getPendingSyncCounts();
  const total = Number(pending.total || 0);

  if (!total) {
    notifyProgress(onProgress, {
      phase: 'pending',
      status: 'completed',
      title: 'Sincronizacion de pendientes',
      detail: 'No hay cambios pendientes por sincronizar.',
      percent: 100,
      processed: 0,
      total: 0
    });

    return {
      skipped: true,
      total: 0,
      processed: 0,
      synced: 0,
      failed: 0,
      discarded: 0
    };
  }

  let processed = 0;
  let synced = 0;
  let failed = 0;
  let discarded = 0;

  notifyProgress(onProgress, {
    phase: 'pending',
    status: 'running',
    title: 'Sincronizando cambios pendientes...',
    detail: `${processed} de ${total} elementos sincronizados`,
    percent: 0,
    processed,
    total
  });

  if (pending.apiPending > 0) {
    const apiResult = await syncPendingOfflineMutations({
      onProgress: (progress) => {
        const apiProcessed = Number(progress?.processed || 0);
        const apiSynced = Number(progress?.synced || 0);
        const apiFailed = Number(progress?.failed || 0);
        const apiDiscarded = Number(progress?.discarded || 0);

        processed = Math.min(total, apiProcessed);
        synced = apiSynced;
        failed = apiFailed;
        discarded = apiDiscarded;

        const percent = total ? Math.round((processed / total) * 100) : 100;
        notifyProgress(onProgress, {
          phase: 'pending',
          status: 'running',
          title: 'Sincronizando cambios pendientes...',
          detail: `${processed} de ${total} elementos sincronizados`,
          percent,
          processed,
          total,
          synced,
          failed,
          discarded
        });
      }
    });

    processed = Math.max(processed, Number(apiResult?.processed || pending.apiPending));
    synced = Number(apiResult?.synced || synced);
    failed = Number(apiResult?.failed || failed);
    discarded = Number(apiResult?.discarded || discarded);
  }

  if (pending.legacyPending > 0) {
    const legacyResult = await syncPendingVisits();
    processed = Math.min(total, processed + pending.legacyPending);
    synced += Number(legacyResult?.synced || 0);
    failed += Number(legacyResult?.failed || 0);
  }

  const percent = total ? Math.round((processed / total) * 100) : 100;
  notifyProgress(onProgress, {
    phase: 'pending',
    status: 'completed',
    title: 'Sincronizacion de pendientes',
    detail: `${processed} de ${total} elementos sincronizados`,
    percent,
    processed,
    total,
    synced,
    failed,
    discarded
  });

  if (codigoPersona) {
    if (failed === 0 && discarded === 0) {
      await markSyncSuccess(codigoPersona);
      await updateUserLastSyncDate(codigoPersona, new Date().toISOString());
    } else {
      await upsertSyncControl(codigoPersona, {
        EstadoSincronizacion: 'partial',
        ObservacionError: `${failed + discarded} cambios pendientes o con error.`,
        FechaUltimoLogin: new Date().toISOString()
      });
    }
  }

  return {
    skipped: false,
    total,
    processed,
    synced,
    failed,
    discarded
  };
}

export async function runIncrementalCatalogRefresh(user, options = {}) {
  if (!isAppOnline()) {
    return { skipped: true };
  }

  const onProgress = options?.onProgress;
  const steps = [
    { table: 'home_overview', run: () => homeService.getOverview() },
    {
      table: 'directory_lists',
      run: () => Promise.all([directoryService.getDoctors(), directoryService.getBranches()])
    },
    { table: 'calendar_visits', run: () => calendarService.getMonthVisits(getCurrentMonthKey()) },
    { table: 'inventory_bootstrap', run: () => inventoryService.getBootstrap() },
    {
      table: 'multimedia_items',
      run: () =>
        multimediaService.getItems({
          codigoTipoMultimedia: 0,
          buscar: ''
        })
    }
  ];

  for (let index = 0; index < steps.length; index += 1) {
    const step = steps[index];
    const percent = Math.round((index / steps.length) * 100);

    notifyProgress(onProgress, {
      phase: 'refresh',
      status: 'running',
      title: 'Actualizando datos base...',
      detail: `Tabla ${step.table}`,
      percent
    });

    try {
      await step.run();
    } catch {
      // Non-blocking refresh.
    }
  }

  notifyProgress(onProgress, {
    phase: 'refresh',
    status: 'completed',
    title: 'Datos base actualizados',
    detail: `${steps.length} tablas procesadas`,
    percent: 100
  });

  const codigoPersona = toPersonaCode(user);

  if (codigoPersona) {
    await upsertSyncControl(codigoPersona, {
      FechaUltimoLogin: new Date().toISOString()
    });
  }

  return { skipped: false };
}

export async function runOnlineSyncFlow(options = {}) {
  const user = options?.user;
  const onProgress = options?.onProgress;
  const forceInitial = Boolean(options?.forceInitial);
  const allowCatalogRefresh = Boolean(options?.allowCatalogRefresh);
  const shouldQueueWarmup = options?.queueWarmupAfterInitial !== false;

  if (isSyncBypassed()) {
    notifyProgress(onProgress, {
      phase: 'complete',
      status: 'completed',
      title: 'Sincronizacion omitida',
      detail: 'Sincronizacion deshabilitada temporalmente.',
      percent: 100
    });

    return {
      initialRan: false,
      pendingRan: false,
      refreshRan: false,
      warmupQueued: false,
      bypassed: true
    };
  }

  if (!user) {
    throw new Error('No se encontro un usuario valido para sincronizar.');
  }

  if (!isAppOnline()) {
    const error = new Error('No hay conexion disponible para sincronizar.');
    error.code = 'OFFLINE_UNAVAILABLE';
    throw error;
  }

  const access = options?.preloadedAccess || (await evaluateAccessRequirements(user, true));
  const summary = {
    initialRan: false,
    pendingRan: false,
    refreshRan: false,
    warmupQueued: false,
    access
  };

  notifyProgress(onProgress, {
    phase: 'check',
    status: 'running',
    title: 'Validando sesion y conectividad...',
    detail: access.shouldRunMandatorySync
      ? 'Se requiere sincronizacion inicial obligatoria.'
      : 'Sincronizacion diaria ya validada.',
    percent: 2
  });

  if (forceInitial || access.shouldRunMandatorySync) {
    await runMandatoryInitialSync(user, { onProgress });
    summary.initialRan = true;

    if (shouldQueueWarmup) {
      queueWarmupSync(user).catch(() => {
        // Keep warmup failures non-blocking for login speed.
      });
      summary.warmupQueued = true;
    }
  }

  const pending = options?.preloadedPending || (await getPendingSyncCounts());

  if (pending.total > 0) {
    await runPendingOfflineSync(user, { onProgress });
    summary.pendingRan = true;
  } else if (!summary.initialRan && allowCatalogRefresh && access.shouldRunCatalogRefresh) {
    await runIncrementalCatalogRefresh(user, { onProgress });
    summary.refreshRan = true;
  }

  notifyProgress(onProgress, {
    phase: 'complete',
    status: 'completed',
    title: 'Sincronizacion completada',
    detail: 'La aplicacion esta lista para usar online y offline.',
    percent: 100
  });

  return {
    ...summary,
    pendingAfter: await getPendingSyncCounts(),
    readinessAfter: await checkInitialOfflineReadiness(user)
  };
}
