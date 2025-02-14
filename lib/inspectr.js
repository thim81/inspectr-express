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
  APPLICATION_JSON: 'application/json',
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
  const status = res.statusCode;
  return { headers, status };
}

/**
 * The “capture” middleware.
 * It returns a promise that resolves (after the response is finished)
 * with an object containing the URL, request details, response details, and latency.
 */
function capture(req, res, next, options = { broadcast: true, print: true }) {
  const start = Date.now();
  const contentType = req.get('content-type') || '';
  let data = { url: '', endpoint: '', request: {}, response: {}, latency: 0, timestamp: '' };

  return parseRequestBody(contentType, req, res, {})
    .then((payload) => {
      if (typeof payload !== 'string') {
        try {
          payload = JSON.stringify(payload);
        } catch (err) {
          payload = String(payload);
        }
      }
      data.request = Object.assign({}, data.request, { payload });
      return parseResponseBody(res, {}, next);
    })
    .catch((e) => {
      next();
      return Promise.reject(e);
    })
    .then((payload) => {
      const requestMeta = parseRequestMeta(req);
      data.response = Object.assign({}, data.response, { payload });
      data.url = parseUrl(req);
      data.endpoint = requestMeta.endpoint;
      data.timestamp = requestMeta.timestamp;
      data.request.queryParams = requestMeta.queryParams;
      Object.assign(data.request, requestMeta);
      Object.assign(data.response, parseResponseMeta(res));
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
  // Convert the data to JSON.
  const postData = JSON.stringify(data);
  const urlObj = new URL(broadcastUrl);
  // Choose http or https based on the URL.
  const protocol = urlObj.protocol === 'https:' ? require('https') : require('http');

  const options = {
    hostname: urlObj.hostname,
    port: urlObj.port,
    path: urlObj.pathname,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData),
    },
  };

  const req = protocol.request(options, (res) => {
    // Optionally, you can handle the response here.
    res.on('data', () => {});
  });

  req.on('error', (err) => {
    console.error('Inspectr broadcast error:', err);
  });

  req.write(postData);
  req.end();

  return data;
}

/**
 * Print the request summary to the console.
 */
function print(data) {
  console.log(
    `${data.response.status} - ${data.request.method} ${data.endpoint} (${data.latency}ms) - ${data.timestamp}`
  );
  return data;
}

module.exports = {
  capture,
  broadcast,
  print,
  setBroadcastUrl,
  ContentTypes,
  parseRequestBody,
  parseResponseBody,
  parseUrl,
  parseRequestMeta,
  parseResponseMeta,
};
