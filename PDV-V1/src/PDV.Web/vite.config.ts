import basicSsl from '@vitejs/plugin-basic-ssl';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const useHttps = env.VITE_DEV_HTTPS !== 'false';
  const apiProxyTarget = env.VITE_API_PROXY_TARGET || 'http://localhost:5080';

  return {
    plugins: [react(), ...(useHttps ? [basicSsl()] : [])],
    server: {
      host: '0.0.0.0',
      port: 5173,
      strictPort: true,
      https: useHttps ? {} : undefined,
      proxy: {
        '/api': {
          target: apiProxyTarget,
          changeOrigin: true,
          secure: false
        },
        '/hubs': {
          target: apiProxyTarget,
          changeOrigin: true,
          secure: false,
          ws: true
        }
      }
    },
    preview: {
      host: '0.0.0.0',
      port: 4173,
      strictPort: true
    }
  };
});
