import { defineConfig, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { renderPatchedProxyPage } from './src/server/proxyEngine';

/**
 * Custom Vite plugin to handle live proxy route requests during development
 */
function proxyMiddlewarePlugin(): Plugin {
  return {
    name: 'a11ysentinel-proxy-middleware',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url || '';

        // Match /proxy/aud_... or /api/proxy
        if (url.startsWith('/proxy/') || url.startsWith('/api/proxy')) {
          try {
            const parsedUrl = new URL(url, 'http://localhost:3000');
            let auditId = parsedUrl.searchParams.get('auditId') || '';
            let targetUrl = parsedUrl.searchParams.get('url') || '';

            if (url.startsWith('/proxy/')) {
              const pathPart = url.replace('/proxy/', '').split('?')[0];
              if (pathPart) auditId = pathPart;
            }

            const html = await renderPatchedProxyPage({
              auditId,
              targetUrl,
            });

            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.statusCode = 200;
            res.end(html);
            return;
          } catch (err) {
            console.error('Error in proxy middleware:', err);
            res.statusCode = 500;
            res.end(`<h1>Proxy Error</h1><pre>${err}</pre>`);
            return;
          }
        }

        next();
      });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), proxyMiddlewarePlugin()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    open: false,
  },
});
