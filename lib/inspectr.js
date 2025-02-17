// lib/inspectr.js

const textBody = require('body');
const jsonBody = require('body/json');
const formBody = require('body/form');
const anyBody = require('body/any');

// --- SSE Broadcast Setup ---
// Instead of a persistent connection, use a broadcast URL.
let broadcastUrl = process.env.INSPECTR_BROADCAST_URL || 'http://localhost:4004/sse';

// Optionally, update the broadcast URL if needed.
function setBroadcastUrl(url) {
  broadcastUrl = url;
  console.log(`Inspectr broadcast URL set to ${broadcastUrl}`);
}

// --- Express Request / Response middleware ---

const ContentTypes = {
  TEXT_PLAIN: 'text/plain',
  APPLICATION_FORM: 'application/x-www-form-urlencoded',
  APPLICATION_JSON: 'application/json'
};

/**
 * Parse the request body based on content type.
 */
// function parseRequestBody(contentType, req, res, options) {
//     let bodyParser;
//     switch (contentType) {
//         case ContentTypes.TEXT_PLAIN:
//             bodyParser = new Promise(resolve => textBody(req, (err, body) => resolve(body)));
//             break;
//         case ContentTypes.APPLICATION_FORM:
//             bodyParser = new Promise(resolve => formBody(req, {}, (err, body) => resolve(body)));
//             break;
//         case ContentTypes.APPLICATION_JSON:
//             bodyParser = new Promise(resolve => jsonBody(req, res, (err, body) => resolve(body)));
//             break;
//         default:
//             bodyParser = new Promise(resolve => anyBody(req, res, {}, (err, body) => resolve(body)));
//             break;
//     }
//     return bodyParser;
// }
function parseRequestBody(contentType, req, res, options) {
  // If another middleware already parsed the body, use it.
  if (req.body !== undefined) {
    return Promise.resolve(req.body);
  }

  // If there is no content-type or it's a GET/HEAD request,
  if (!contentType || req.method === 'GET' || req.method === 'HEAD') {
    req.body = {};
    return Promise.resolve(req.body);
  }

  return new Promise((resolve, reject) => {
    let parser;
    switch (contentType) {
      case ContentTypes.TEXT_PLAIN:
        parser = textBody;
        break;
      case ContentTypes.APPLICATION_FORM:
        parser = formBody;
        break;
      case ContentTypes.APPLICATION_JSON:
        parser = jsonBody;
        break;
      default:
        parser = anyBody;
        break;
    }
    parser(req, res, { limit: '50mb' }, (err, body) => {
      if (err) return reject(err);
      // Attach parsed body so that later middleware can also use it.
      req.body = body;
      resolve(body);
    });
  });
}

/**
 * Intercept the response so that we can capture its body.
 */
function parseResponseBody(res, options, next) {
  return new Promise((resolve, reject) => {
    const originalWrite = res.write;
    const originalEnd = res.end;
    const chunks = [];

    res.write = function (chunk, ...args) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      originalWrite.apply(res, [chunk, ...args]);
    };

    res.end = function (chunk, ...args) {
      if (chunk) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      originalEnd.apply(res, [chunk, ...args]);
    };

    res.once('finish', () => {
      resolve(Buffer.concat(chunks).toString('utf8'));
    });

    next();
  });
}

/**
 * Construct the full URL.
 */
function parseUrl(req) {
  const protocol = req.protocol || req.get('X-Forwarded-Protocol') || 'http';
  const host = req.hostname || req.get('host');
  const path = req.originalUrl || req.url;
  return `${protocol}://${host}${path}`;
}

/**
 * Extract request meta-data.
 */
function parseRequestMeta(req) {
  const method = req.method;
  const headers = req.headers;
  const host = req.get('host');
  const clientIp = req.headers['x-forwarded-for'] || req.ip;

  // Extract endpoint and query parameters from the full URL
  const fullUrl = parseUrl(req);
  const urlObj = new URL(req.originalUrl, fullUrl);
  const endpoint = urlObj.pathname;
  const queryParams = Object.fromEntries(urlObj.searchParams.entries());
  const timestamp = new Date().toISOString();

  return { method, headers, host, clientIp, endpoint, queryParams, timestamp };
}

/**
 * Extract response meta-data.
 */
function parseResponseMeta(res) {
  const headers = res.getHeaders ? res.getHeaders() : res._headers;
  const statusCode = res.statusCode;
  const statusMessage = res.statusMessage;
  return { headers, statusCode, statusMessage };
}

/**
 * The “capture” middleware.
 * It returns a promise that resolves (after the response is finished)
 * with an object containing the details of the HTTP transaction.
 */
function capture(req, res, next, options = { broadcast: true, print: true }) {
  const start = Date.now();
  const contentType = req.get('content-type') || '';
  let data = {
    method: '',
    url: '',
    server: '',
    path: '',
    clientIp: '',
    timestamp: '', // Root-level timestamp (request arrival)
    latency: 0,
    request: {
      payload: '',
      headers: {},
      queryParams: {},
      timestamp: ''
    },
    response: {
      payload: '',
      headers: {},
      statusCode: 0,
      statusMessage: '',
      timestamp: ''
    }
  };

  return parseRequestBody(contentType, req, res, {})
    .then((payload) => {
      if (typeof payload !== 'string') {
        try {
          payload = JSON.stringify(payload);
        } catch (err) {
          payload = String(payload);
        }
      }
      data.request.payload = payload;
      return parseResponseBody(res, {}, next);
    })
    .catch((e) => {
      next();
      return Promise.reject(e);
    })
    .then((respPayload) => {
      data.response.payload = respPayload;
      const requestMeta = parseRequestMeta(req);

      // Set root-level fields.
      data.method = requestMeta.method;
      data.server = requestMeta.host;
      data.clientIp = requestMeta.clientIp;
      data.path = requestMeta.endpoint;
      data.url = parseUrl(req);

      // Set request-specific details.
      data.request.queryParams = requestMeta.queryParams;
      data.request.headers = requestMeta.headers;
      data.request.timestamp = requestMeta.timestamp;

      // Set response-specific details.
      const responseMeta = parseResponseMeta(res);
      data.response.headers = responseMeta.headers;
      data.response.statusCode = responseMeta.statusCode;
      data.response.statusMessage = responseMeta.statusMessage;
      data.response.timestamp = new Date().toISOString();

      // Calculate latency.
      data.latency = Date.now() - start;

      return data;
    })
    .then((data) => {
      // Handle broadcasting and printing based on options
      if (options.broadcast) {
        data = broadcast(data);
      }
      if (options.print) {
        data = print(data);
      }
      return data;
    });
}

/**
 * Broadcast the captured request/response via HTTP POST to the SSE server.
 */
function broadcast(data) {
  // Wrap the Inspectr data in a CloudEvent envelope before broadcasting.
  const cloudEvent = wrapInCloudEvent(data);
  const postData = JSON.stringify(cloudEvent);
  const urlObj = new URL(broadcastUrl);
  const protocol = urlObj.protocol === 'https:' ? require('https') : require('http');

  const options = {
    hostname: urlObj.hostname,
    port: urlObj.port,
    path: urlObj.pathname,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData)
    }
  };

  const req = protocol.request(options, (res) => {
    res.on('data', () => {});
  });

  req.on('error', (err) => {
    console.error('Inspectr broadcast error:', err);
  });

  req.write(postData);
  req.end();

  return data;
}

function getBgColor(status) {
  if (status >= 200 && status < 300) return '\x1b[42m';
  if (status >= 300 && status < 400) return '\x1b[44m';
  if (status >= 400 && status < 500) return '\x1b[43m';
  if (status >= 500) return '\x1b[41m';
  return ''; // Default: no background
}

/**
 * Print the request summary to the console.
 */
function print(data) {
  const status = data.response.statusCode;
  const bgColor = getBgColor(status);
  const reset = '\x1b[0m'; // Reset ANSI styles
  const coloredStatus = `${bgColor}${status}${reset}`;

  console.log(
    `${coloredStatus} - ${data.method} ${data.path} (${data.latency}ms) - ${data.request.timestamp}`
  );
  return data;
}

/**
 * Generate a UUID v4.
 * Uses crypto.randomUUID if available; otherwise, falls back to a simple generator.
 */
function generateUUID() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  } else {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      const r = (Math.random() * 16) | 0,
        v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }
}

/**
 * Wraps the given Inspectr data in a CloudEvent envelope.
 */
function wrapInCloudEvent(data) {
  return {
    specversion: '1.0',
    type: 'com.inspectr.http',
    source: '/inspectr',
    id: generateUUID(),
    time: new Date().toISOString(),
    datacontenttype: 'application/json',
    data: data
  };
}

module.exports = {
  capture,
  broadcast,
  print,
  wrapInCloudEvent,
  setBroadcastUrl,
  ContentTypes,
  parseRequestBody,
  parseResponseBody,
  parseUrl,
  parseRequestMeta,
  parseResponseMeta,
  generateUUID,
  getBgColor
};
