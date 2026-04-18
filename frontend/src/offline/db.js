import { openDB } from 'idb';

const DB_NAME = 'visitas_pwa_db';
const DB_VERSION = 5;

let dbPromise;

export function getOfflineDb() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('pendingMutations')) {
          db.createObjectStore('pendingMutations', { keyPath: 'id', autoIncrement: true });
        }

        if (!db.objectStoreNames.contains('visitCache')) {
          db.createObjectStore('visitCache', { keyPath: 'cacheKey' });
        }

        if (!db.objectStoreNames.contains('tblEntregaMuestras')) {
          const entregaStore = db.createObjectStore('tblEntregaMuestras', {
            keyPath: 'CodigoEntrega',
            autoIncrement: true
          });

          entregaStore.createIndex('byCodigoVisitaMedica', 'CodigoVisitaMedica');
        }

        if (!db.objectStoreNames.contains('BinarioOrdenMuestraFirmas')) {
          const firmaStore = db.createObjectStore('BinarioOrdenMuestraFirmas', {
            keyPath: 'CodigoBinarioOrdenMuestraFirma',
            autoIncrement: true
          });

          firmaStore.createIndex('byCodigoEntrega', 'CodigoEntrega');
        }

        if (!db.objectStoreNames.contains('tblProductosXEntregaMuestras')) {
          const productosStore = db.createObjectStore('tblProductosXEntregaMuestras', {
            keyPath: 'CodigoProductoXEntrega',
            autoIncrement: true
          });

          productosStore.createIndex('byCodigoEntrega', 'CodigoEntrega');
          productosStore.createIndex('byCodigoProducto', 'CodigoProducto');
        }

        if (!db.objectStoreNames.contains('apiResponseCache')) {
          const apiCacheStore = db.createObjectStore('apiResponseCache', {
            keyPath: 'cacheKey'
          });

          apiCacheStore.createIndex('byScopeKey', 'scopeKey');
          apiCacheStore.createIndex('byPath', 'path');
        }

        if (!db.objectStoreNames.contains('pendingApiMutations')) {
          const pendingApiMutationsStore = db.createObjectStore('pendingApiMutations', {
            keyPath: 'id',
            autoIncrement: true
          });

          pendingApiMutationsStore.createIndex('byScopeKey', 'scopeKey');
          pendingApiMutationsStore.createIndex('byQueuedAt', 'queuedAt');
        }

        if (!db.objectStoreNames.contains('multimediaCoverCache')) {
          const multimediaCoverStore = db.createObjectStore('multimediaCoverCache', {
            keyPath: 's3Key'
          });

          multimediaCoverStore.createIndex('byUpdatedAt', 'updatedAt');
        }

        if (!db.objectStoreNames.contains('localTblControlSincronizacion')) {
          const syncControlStore = db.createObjectStore('localTblControlSincronizacion', {
            keyPath: 'CodigoPersona'
          });

          syncControlStore.createIndex('byFechaUltimaSincronizacion', 'FechaUltimaSincronizacion');
          syncControlStore.createIndex('byEstadoSincronizacion', 'EstadoSincronizacion');
        }

        if (!db.objectStoreNames.contains('localTblPersonas')) {
          const personasStore = db.createObjectStore('localTblPersonas', {
            keyPath: 'CodigoPersona'
          });

          personasStore.createIndex('byFechaUltimoLogin', 'FechaUltimoLogin');
          personasStore.createIndex('byFechaUltimaSincronizacion', 'FechaUltimaSincronizacion');
        }
      }
    });
  }

  return dbPromise;
}
