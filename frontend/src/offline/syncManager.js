import { visitService } from '../services/visitService';
import { getPendingMutations, removePendingMutation } from './queue';

export async function syncPendingVisits() {
  const pendingMutations = await getPendingMutations();
  let synced = 0;
  let failed = 0;

  for (const mutation of pendingMutations) {
    try {
      if (mutation.type === 'create_visit') {
        await visitService.create(mutation.payload);
      }

      await removePendingMutation(mutation.id);
      synced += 1;
    } catch (error) {
      failed += 1;
    }
  }

  return {
    total: pendingMutations.length,
    synced,
    failed
  };
}
