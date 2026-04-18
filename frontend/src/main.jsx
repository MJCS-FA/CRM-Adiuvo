import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App as AntApp, ConfigProvider } from 'antd';
import App from './app/App';
import { appPaths } from './config/appPaths';
import { AuthProvider } from './context/AuthContext';
import { registerServiceWorker } from './pwa/registerServiceWorker';
import './styles/index.css';

function normalizePathname(value, fallback = '/') {
  const text = String(value || '').trim();

  if (!text) {
    return fallback;
  }

  const normalized = text.startsWith('/') ? text : `/${text}`;

  if (normalized === '/') {
    return '/';
  }

  return normalized.replace(/\/+$/, '') || '/';
}

function buildOfflineEntryPath() {
  const basePath = normalizePathname(appPaths.routerBasename || '/');
  const suffix = '/directorio';

  if (basePath === '/') {
    return suffix;
  }

  return `${basePath}${suffix}`;
}

function persistOfflineNavigationPaths() {
  try {
    localStorage.setItem('visitas.app.basePath', appPaths.appBasePath || '/');
    localStorage.setItem('visitas.app.entryPath', buildOfflineEntryPath());
  } catch {
    // Ignore storage write errors in restricted environments.
  }
}

registerServiceWorker();
persistOfflineNavigationPaths();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: '#1A67E2',
          borderRadius: 10,
          fontFamily: 'Poppins, Segoe UI, sans-serif'
        },
        components: {
          Button: {
            controlHeight: 42,
            borderRadius: 10
          },
          Input: {
            controlHeight: 44,
            borderRadius: 10
          },
          Card: {
            borderRadiusLG: 14
          }
        }
      }}
    >
      <AntApp>
        <BrowserRouter basename={appPaths.routerBasename}>
          <AuthProvider>
            <App />
          </AuthProvider>
        </BrowserRouter>
      </AntApp>
    </ConfigProvider>
  </React.StrictMode>
);
