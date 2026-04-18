import { getOfflineDb } from './db';

function buildCacheKey(userId) {
  return `visits_${userId || 'anonymous'}`;
}

export async function setCachedVisits(userId, visits) {
  const db = await getOfflineDb();
  const cacheKey = buildCacheKey(userId);

  await db.put('visitCache', {
    cacheKey,
    visits,
    updatedAt: new Date().toISOString()
  });
}

export async function getCachedVisits(userId) {
  const db = await getOfflineDb();
  const cacheKey = buildCacheKey(userId);
  const cached = await db.get('visitCache', cacheKey);

  return cached?.visits || [];
}
