import { appPaths } from '../config/appPaths';

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    return;
  }

  window.addEventListener('load', async () => {
    try {
      const scope = appPaths.appBasePath;
      await navigator.serviceWorker.register(`${scope}sw.js`, { scope });
    } catch (error) {
      console.error('Service worker registration failed', error);
    }
  });
}
