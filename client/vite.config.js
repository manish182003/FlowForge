import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('error', (err, req, res) => {
            if (err.code === 'ECONNREFUSED' && res && !res.headersSent) {
              res.writeHead(503, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ 
                success: false, 
                error: 'Backend API server is not running on port 5000. Start it with `npm run dev` in /server' 
              }));
            }
          });
        }
      },
      '/ws': {
        target: 'ws://localhost:5000',
        ws: true,
        configure: (proxy) => {
          proxy.on('error', (err) => {
            // Silently suppress expected socket aborts/disconnects when server is offline or reconnecting
            if (['ECONNRESET', 'ECONNABORTED', 'ECONNREFUSED', 'EPIPE'].includes(err.code)) {
              return;
            }
            console.warn('[Vite WS Proxy Notice]', err.message);
          });
        }
      }
    }
  }
});
