'use strict';
// Local preview only. Only public application assets are served.
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const allowed = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
  ['/core.js', ['core.js', 'application/javascript; charset=utf-8']],
  ['/app.js', ['app.js', 'application/javascript; charset=utf-8']],
  ['/icon.svg', ['icon.svg', 'image/svg+xml']],
]);
const port = Number(process.env.CLEARCSV_PORT || 4173);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('CLEARCSV_PORT must be between 1024 and 65535.');
const server = http.createServer(async (req, res) => {
  if (req.headers.host !== `127.0.0.1:${port}` && req.headers.host !== `localhost:${port}`) { res.writeHead(403); return res.end('Forbidden'); }
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, { Allow: 'GET, HEAD' }); return res.end('Method not allowed'); }
  const asset = allowed.get((req.url || '').split('?')[0]);
  if (!asset) { res.writeHead(404); return res.end('Not found'); }
  try {
    const body = await fs.readFile(path.join(__dirname, asset[0]));
    res.writeHead(200, { 'Content-Type': asset[1], 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store', 'Content-Length': body.length });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch { res.writeHead(500); res.end('Unable to load application asset'); }
});
server.listen(port, '127.0.0.1', () => console.log(`ClearCSV preview: http://127.0.0.1:${port} (PID ${process.pid})`));
