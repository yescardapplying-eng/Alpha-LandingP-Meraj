require('dotenv').config();
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = parseInt(process.env.PORT, 10) || 3000;
const BASE_DIR = path.resolve(__dirname);

const MIME_TYPES = {
  '.html': 'text/html; charset=UTF-8',
  '.css': 'text/css; charset=UTF-8',
  '.js': 'application/javascript; charset=UTF-8',
  '.json': 'application/json; charset=UTF-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.webp': 'image/webp'
};

// Internal files and directories that must never be served statically
const BLOCKED_PATTERNS = [
  /^\/\./,                   // Hidden files (.env, .git, etc.)
  /^\/node_modules(\/|$)/i,  // Dependencies
  /^\/lib(\/|$)/i,           // Server libraries
  /^\/database(\/|$)/i,      // SQL schema
  /^\/api(\/|$)/i,           // API handlers (served only via dispatcher)
  /^\/server\.js$/i,         // Server script
  /^\/package.*\.json$/i,    // Package manifests
  /^\/vercel\.json$/i,       // Deployment config
  /^\/test.*\.js$/i,         // Test scripts
  /^\/readme\.md$/i          // Readme docs
];

function isBlocked(urlPath) {
  return BLOCKED_PATTERNS.some(pattern => pattern.test(urlPath));
}

async function requestHandler(req, res) {
  const reqUrl = req.url.split('?')[0];
  const reqPath = decodeURI(reqUrl);

  // 1. API Route Dispatcher for Local Development
  if (reqPath === '/api/track-step' || reqPath === '/api/track-step.js') {
    try {
      const handler = require('./api/track-step');
      return await handler(req, res);
    } catch (err) {
      console.error('[Local Server API Error /api/track-step]', err);
      res.writeHead(500, { 'Content-Type': 'application/json; charset=UTF-8' });
      return res.end(JSON.stringify({ success: false, message: 'Internal Server Error' }));
    }
  }

  if (reqPath === '/api/submit-lead' || reqPath === '/api/submit-lead.js') {
    try {
      const handler = require('./api/submit-lead');
      return await handler(req, res);
    } catch (err) {
      console.error('[Local Server API Error /api/submit-lead]', err);
      res.writeHead(500, { 'Content-Type': 'application/json; charset=UTF-8' });
      return res.end(JSON.stringify({ success: false, message: 'Internal Server Error' }));
    }
  }

  // Handle any other unmatched /api/* requests with JSON 404
  if (reqPath.startsWith('/api/')) {
    res.writeHead(404, { 'Content-Type': 'application/json; charset=UTF-8' });
    return res.end(JSON.stringify({ success: false, message: 'API route not found' }));
  }

  // 2. Static File Security: Block private files and directories
  if (isBlocked(reqPath)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=UTF-8' });
    return res.end('404 Not Found');
  }

  let staticPath = reqPath;
  if (staticPath === '/' || staticPath === '') {
    staticPath = '/index.html';
  }

  // Prevent directory traversal
  const safePath = path.normalize(staticPath).replace(/^(\.\.[\/\\])+/, '');
  let filePath = path.resolve(BASE_DIR, '.' + safePath);

  // Security check: Must remain within BASE_DIR
  if (!filePath.startsWith(BASE_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=UTF-8' });
    return res.end('403 Forbidden');
  }

  fs.stat(filePath, (err, stats) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=UTF-8' });
      res.end('404 Not Found');
      return;
    }

    if (stats.isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(filePath, (readErr, content) => {
      if (readErr) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=UTF-8' });
        res.end('500 Internal Server Error');
        return;
      }
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    });
  });
}

function startServer(port = PORT, host = '0.0.0.0') {
  return new Promise((resolve, reject) => {
    const srv = http.createServer(requestHandler);
    srv.once('error', (err) => {
      reject(err);
    });
    srv.listen(port, host, () => {
      const address = srv.address();
      const actualPort = typeof address === 'object' && address ? address.port : port;
      resolve({ server: srv, port: actualPort });
    });
  });
}

// Bind to all network interfaces on the configured port only when executed directly
if (require.main === module) {
  startServer(PORT)
    .then(({ port }) => {
      console.log(`Stock Market server running at http://localhost:${port}/`);
      console.log(`Local IPv4 address: http://127.0.0.1:${port}/`);
    })
    .catch((err) => {
      console.error(`Failed to start server on port ${PORT}:`, err.message);
      process.exit(1);
    });
}

const defaultServer = http.createServer(requestHandler);
defaultServer.startServer = startServer;
defaultServer.requestHandler = requestHandler;
defaultServer.isBlocked = isBlocked;
defaultServer.MIME_TYPES = MIME_TYPES;
defaultServer.BLOCKED_PATTERNS = BLOCKED_PATTERNS;

module.exports = defaultServer;
