import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { resolveAppPaths } from './src/config/appPaths.js';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const appPaths = resolveAppPaths(env);

  return {
    plugins: [react()],
    base: appPaths.appBasePath,
    server: {
      host: '0.0.0.0',
      port: 5173,
      proxy: {
        [appPaths.apiPath]: {
          target: appPaths.proxyTarget,
          changeOrigin: true
        }
      }
    },
    build: {
      outDir: 'dist',
      sourcemap: true
    }
  };
});
