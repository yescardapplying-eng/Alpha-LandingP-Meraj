require('dotenv').config();
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const BASE_DIR = __dirname;

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

const server = http.createServer(async (req, res) => {
  const reqUrl = req.url.split('?')[0];
  const reqPath = decodeURI(reqUrl);

  // API Route Dispatcher for Local Development
  if (reqPath === '/api/track-step' || reqPath === '/api/track-step.js') {
    try {
      const handler = require('./api/track-step');
      return await handler(req, res);
    } catch (err) {
      console.error('[Local Server API Error]', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, message: 'Internal Server Error' }));
    }
  }

  if (reqPath === '/api/submit-lead' || reqPath === '/api/submit-lead.js') {
    try {
      const handler = require('./api/submit-lead');
      return await handler(req, res);
    } catch (err) {
      console.error('[Local Server API Error]', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, message: 'Internal Server Error' }));
    }
  }

  let staticPath = reqPath;
  if (staticPath === '/' || staticPath === '') {
    staticPath = '/index.html';
  }

  // Prevent directory traversal
  const safePath = path.normalize(staticPath).replace(/^(\.\.[\/\\])+/, '');
  let filePath = path.join(BASE_DIR, safePath);

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
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Server running at http://localhost:${PORT}/`);
  console.log(`Alternative URL: http://127.0.0.1:${PORT}/`);
});
