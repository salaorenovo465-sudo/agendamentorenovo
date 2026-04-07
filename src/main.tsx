import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

const root = createRoot(document.getElementById('root')!);

const normalizePath = (value: string): string => value.replace(/^\/+|\/+$/g, '');

const appBasePath = normalizePath(import.meta.env.VITE_APP_BASE_PATH || '');
const normalizedCurrentPathRaw = normalizePath(window.location.pathname);
const normalizedCurrentPath =
  appBasePath && (normalizedCurrentPathRaw === appBasePath || normalizedCurrentPathRaw.startsWith(`${appBasePath}/`))
    ? normalizePath(normalizedCurrentPathRaw.slice(appBasePath.length))
    : normalizedCurrentPathRaw;

const normalizedAdminPath = (import.meta.env.VITE_ADMIN_PATH || 'renovo-admin').replace(/^\/+|\/+$/g, '');
const isAdminRoute = normalizedCurrentPath === normalizedAdminPath;

if (isAdminRoute) {
  import('./admin/AdminApp.tsx').then(({ default: AdminApp }) => {
    root.render(
      <StrictMode>
        <AdminApp />
      </StrictMode>,
    );
  });
} else {
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
