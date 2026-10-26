/**
 * ============================================================================
 * STOCK MARKET — BACKEND HELPERS
 * ============================================================================
 */

/**
 * Generates human-readable, unique Lead Reference
 * Format: AT-YYYYMMDD-XXXX (e.g. AT-20261008-7241)
 */
function generateLeadReference() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const dateStr = `${year}${month}${day}`;

  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let rand = '';
  for (let i = 0; i < 4; i++) {
    rand += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  return `AT-${dateStr}-${rand}`;
}

/**
 * Server-side client IP extractor
 * Parses x-forwarded-for, x-real-ip or socket remoteAddress
 */
function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const list = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    const clientIp = list.split(',')[0].trim();
    if (clientIp) return clientIp.substring(0, 45);
  }
  const realIp = req.headers['x-real-ip'];
  if (realIp) {
    return String(realIp).trim().substring(0, 45);
  }
  if (req.socket && req.socket.remoteAddress) {
    return String(req.socket.remoteAddress).substring(0, 45);
  }
  return '127.0.0.1';
}

/**
 * Extracts User Agent
 */
function getUserAgent(req) {
  const ua = req.headers['user-agent'];
  return ua ? String(ua).substring(0, 500) : '';
}

/**
 * Safely parse incoming request JSON body
 */
async function parseRequestBody(req) {
  if (req.body && typeof req.body === 'object') {
    return req.body;
  }
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body);
    } catch (e) {
      return null;
    }
  }

  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      // Protect against overly large payloads (max 1MB)
      if (body.length > 1e6) {
        req.destroy();
        resolve(null);
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        resolve(null);
      }
    });
    req.on('error', () => resolve(null));
  });
}

/**
 * Send uniform JSON responses
 */
function sendJson(res, statusCode, data) {
  if (typeof res.status === 'function' && typeof res.json === 'function') {
    return res.status(statusCode).json(data);
  }
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=UTF-8',
    'Cache-Control': 'no-store, no-cache, must-revalidate'
  });
  res.end(JSON.stringify(data));
}

module.exports = {
  generateLeadReference,
  getClientIp,
  getUserAgent,
  parseRequestBody,
  sendJson
};
