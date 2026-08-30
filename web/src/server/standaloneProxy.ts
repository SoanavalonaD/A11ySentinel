import http from 'http';
import { renderPatchedProxyPage } from './proxyEngine';

const PORT = process.env.PORT || 3001;

/**
 * Standalone Node HTTP Proxy Server
 */
const server = http.createServer(async (req, res) => {
  const reqUrl = req.url || '';
  const parsed = new URL(reqUrl, `http://localhost:${PORT}`);

  if (parsed.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', service: 'A11ySentinel-Proxy' }));
    return;
  }

  try {
    const auditId = parsed.searchParams.get('auditId') || parsed.pathname.replace('/proxy/', '');
    const targetUrl = parsed.searchParams.get('url') || undefined;

    const patchedHtml = await renderPatchedProxyPage({
      auditId,
      targetUrl,
    });

    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
    });
    res.end(patchedHtml);
  } catch (err: any) {
    res.writeHead(500, { 'Content-Type': 'text/html' });
    res.end(`<h1>Proxy Server Error</h1><p>${err?.message || err}</p>`);
  }
});

server.listen(PORT, () => {
  console.log(`🚀 A11ySentinel Standalone Proxy Server running on http://localhost:${PORT}`);
});
