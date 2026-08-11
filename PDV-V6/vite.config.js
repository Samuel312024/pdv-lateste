var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
import basicSsl from '@vitejs/plugin-basic-ssl';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';
export default defineConfig(function (_a) {
    var mode = _a.mode;
    var env = loadEnv(mode, process.cwd(), '');
    var useHttps = env.VITE_DEV_HTTPS !== 'false';
    var apiProxyTarget = env.VITE_API_PROXY_TARGET || 'http://localhost:5080';
    return {
        plugins: __spreadArray([react()], (useHttps ? [basicSsl()] : []), true),
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
