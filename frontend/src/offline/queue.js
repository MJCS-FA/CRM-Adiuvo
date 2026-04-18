import { getOfflineDb } from './db';

export async function enqueueCreateVisitMutation(payload) {
  const db = await getOfflineDb();

  return db.add('pendingMutations', {
    type: 'create_visit',
    payload,
    createdAt: new Date().toISOString()
  });
}

export async function getPendingMutations() {
  const db = await getOfflineDb();
  return db.getAll('pendingMutations');
}

export async function removePendingMutation(id) {
  const db = await getOfflineDb();
  await db.delete('pendingMutations', id);
}

export async function getPendingMutationsCount() {
  const db = await getOfflineDb();
  return db.count('pendingMutations');
}
