import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, process.cwd(), '');
  const appBasePath = (env.VITE_APP_BASE_PATH || '').trim().replace(/^\/+|\/+$/g, '');
  const devApiProxyTarget = (env.VITE_DEV_API_PROXY_TARGET || 'http://localhost:3001').trim();

  return {
    base: appBasePath ? `/${appBasePath}/` : '/',
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            'vendor-react': ['react', 'react-dom'],
            'vendor-motion': ['framer-motion', 'motion'],
          },
        },
      },
    },
    server: {
      allowedHosts: true,
      proxy: {
        '/api': {
          target: devApiProxyTarget,
          changeOrigin: true,
        },
        '/health': {
          target: devApiProxyTarget,
          changeOrigin: true,
        },
      },
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify - file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: {
        ignored: [
          '**/database.sqlite',
          '**/database.sqlite-journal',
          '**/.baileys_auth/**'
        ],
      },
    },
  };
});
