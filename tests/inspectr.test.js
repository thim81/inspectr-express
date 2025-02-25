// tests/inspectr.test.js

const http = require('http');
const https = require('https');
const { Readable } = require('stream');
const { EventEmitter } = require('events');
const { describe, it, expect, beforeEach } = require('@jest/globals');

// Require the inspectr module normally so that the actual body parsers are used.
const inspectr = require('../lib/inspectr');
const { wrapInCloudEvent, getBgColor } = require('../lib/inspectr');

const {
  capture,
  broadcast,
  print,
  setBroadcastUrl,
  ContentTypes,
  parseRequestBody,
  parseResponseBody,
  parseUrl,
  parseRequestMeta,
  parseResponseMeta
} = inspectr;

// Helper: Create a Readable stream that contains the provided body string.
function createRequest(bodyStr, method = 'POST', headers = {}) {
  const req = new Readable();
  req._read = () => {
  }; // no-op
  req.push(bodyStr);
  req.push(null);
  req.method = method;
  req.headers = headers;
  // Provide a simple get() method to simulate Express' req.get()
  req.get = (header) => {
    if (header in headers) return headers[header];
    return undefined;
  };
  return req;
}

describe('inspectr module', () => {
  describe('setBroadcastUrl', () => {
    it('should update the broadcast URL and log the change', () => {
      // Capture console.log output.
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {
      });
      const newUrl = 'http://example.com/sse';
      setBroadcastUrl(newUrl);
      expect(logSpy).toHaveBeenCalledWith(`Inspectr broadcast URL set to ${newUrl}`);
      logSpy.mockRestore();
    });
  });

  describe('parseRequestBody', () => {
    it('should return the existing req.body if already parsed', async () => {
      const req = { body: { already: 'parsed' }, method: 'POST' };
      const res = {};
      const result = await parseRequestBody('application/json', req, res, {});
      expect(result).toEqual({ already: 'parsed' });
    });

    it('should return an empty object for GET or HEAD requests', async () => {
      const req = { method: 'GET', body: undefined };
      const res = {};
      const result = await parseRequestBody(null, req, res, {});
      expect(result).toEqual({});
    });

    it('should use the text parser for text/plain', async () => {
      const text = 'Hello, world!';
      const headers = { 'content-type': ContentTypes.TEXT_PLAIN };
      const req = createRequest(text, 'POST', headers);
      const res = {};
      const result = await parseRequestBody(ContentTypes.TEXT_PLAIN, req, res, {});
      expect(result).toBe(text);
    });

    it('should use the JSON parser for application/json', async () => {
      const jsonStr = '{"a":1, "b": "test"}';
      const headers = { 'content-type': ContentTypes.APPLICATION_JSON };
      const req = createRequest(jsonStr, 'POST', headers);
      const res = {};
      const result = await parseRequestBody(ContentTypes.APPLICATION_JSON, req, res, {});
      expect(result).toEqual({ a: 1, b: 'test' });
    });

    it('should use the form parser for application/x-www-form-urlencoded', async () => {
      const formStr = 'a=1&b=2';
      const headers = { 'content-type': ContentTypes.APPLICATION_FORM };
      const req = createRequest(formStr, 'POST', headers);
      const res = {};
      const result = await parseRequestBody(ContentTypes.APPLICATION_FORM, req, res, {});
      // Depending on the parser, the values may be strings.
      expect(result).toEqual({ a: '1', b: '2' });
    });

    it('should use the any parser for an unknown content type', async () => {
      const dataStr = 'some random data';
      const headers = { 'content-type': 'application/unknown' };
      const req = createRequest(dataStr, 'POST', headers);
      const res = {};
      await expect(parseRequestBody('application/unknown', req, res, {}))
        .rejects.toThrow(/Could not parse content type header: application\/unknown/);
    });
  });

  describe('parseResponseBody', () => {
    it('should capture the response body written via res.write and res.end', async () => {
      const res = new EventEmitter();
      let writtenChunks = [];
      res.write = function(chunk, ...args) {
        writtenChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      };
      res.end = function(chunk, ...args) {
        if (chunk) {
          writtenChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        // Simulate the real response ending.
        process.nextTick(() => this.emit('finish'));
      };
      // A simple next function that immediately calls the callback.
      const next = () => {
      };
      const promise = parseResponseBody(res, {}, next);
      // Simulate writing to the response.
      res.write('Hello, ');
      res.end('world!');
      const result = await promise;
      expect(result).toBe(Buffer.concat(writtenChunks).toString('utf8'));
    });
  });

  describe('parseUrl', () => {
    it('should construct the full URL using protocol, host, and path', () => {
      const req = {
        protocol: 'https',
        hostname: 'example.com',
        originalUrl: '/test/path?query=1',
        get: (header) => (header === 'host' ? 'example.com' : null)
      };
      const url = parseUrl(req);
      expect(url).toBe('https://example.com/test/path?query=1');
    });
  });

  describe('parseRequestMeta', () => {
    it('should extract request meta-data correctly', () => {
      const req = {
        method: 'POST',
        headers: { 'x-forwarded-for': '1.2.3.4' },
        get: (header) => {
          if (header === 'host') return 'localhost';
          return null;
        },
        hostname: 'localhost',
        originalUrl: '/api/test?foo=bar',
        ip: '127.0.0.1'
      };
      const meta = parseRequestMeta(req);
      expect(meta.method).toBe('POST');
      expect(meta.headers).toEqual({ 'x-forwarded-for': '1.2.3.4' });
      expect(meta.host).toBe('localhost');
      expect(meta.clientIp).toBe('1.2.3.4'); // x-forwarded-for is preferred if available
      expect(meta.endpoint).toBe('/api/test');
      expect(meta.queryParams).toEqual({ foo: 'bar' });
      expect(new Date(meta.timestamp).toString()).not.toBe('Invalid Date');
    });
  });

  describe('parseResponseMeta', () => {
    it('should extract response meta-data using res.getHeaders()', () => {
      const res = {
        getHeaders: () => ({ 'content-type': 'application/json' }),
        statusCode: 200
      };
      const meta = parseResponseMeta(res);
      expect(meta.headers).toEqual({ 'content-type': 'application/json' });
      expect(meta.statusCode).toBe(200);
    });

    it('should fallback to res._headers if res.getHeaders is not available', () => {
      const res = {
        _headers: { 'content-type': 'text/html' },
        statusCode: 404
      };
      const meta = parseResponseMeta(res);
      expect(meta.headers).toEqual({ 'content-type': 'text/html' });
      expect(meta.statusCode).toBe(404);
    });
  });

  describe('broadcast', () => {
    let server, port, receivedData;
    beforeEach((done) => {
      receivedData = '';
      server = http.createServer((req, res) => {
        if (req.method === 'POST' && req.url === '/sse') {
          req.on('data', (chunk) => {
            receivedData += chunk;
          });
          req.on('end', () => {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end();
          });
        } else {
          res.writeHead(404);
          res.end();
        }
      });
      server.listen(0, () => {
        port = server.address().port;
        // Update the broadcast URL using the actual function.
        setBroadcastUrl(`http://localhost:${port}/sse`);
        done();
      });
    });

    afterEach((done) => {
      server.close(done);
    });

    it('should post data to the broadcast URL and return the data', (done) => {
      const data = { test: 'broadcast' };
      // Call broadcast (which uses the real http.request)
      const returnedData = broadcast(data);
      expect(returnedData).toEqual(data);

      // Wait a little to allow the POST to be processed.
      setTimeout(() => {
        expect(receivedData).toContain(JSON.stringify(data));
        expect(receivedData).toContain('specversion');
        done();
      }, 100);
    });

    it('should log an error if the broadcast request errors', (done) => {
      // Override http.request temporarily to simulate an error.
      const originalHttpRequest = http.request;
      const fakeRequest = new EventEmitter();
      fakeRequest.write = () => {
      };
      fakeRequest.end = () => {
        // Simulate an error after ending the request.
        process.nextTick(() => fakeRequest.emit('error', new Error('Simulated error')));
      };
      http.request = (options, callback) => {
        const fakeResponse = new EventEmitter();
        process.nextTick(() => callback(fakeResponse));
        return fakeRequest;
      };

      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {
      });
      const data = { test: 'broadcast error' };
      broadcast(data);

      setTimeout(() => {
        expect(errorSpy).toHaveBeenCalledWith('Inspectr broadcast error:', expect.any(Error));
        // Restore original http.request and console.error.
        http.request = originalHttpRequest;
        errorSpy.mockRestore();
        done();
      }, 100);
    });
  });

  it('should wrap data as cloudEvents', (done) => {
    const data = { test: 'broadcast' };
    // Call broadcast (which uses the real http.request)
    const wrappedData = wrapInCloudEvent(data);

    // Wait a little to allow the POST to be processed.
    setTimeout(() => {
      const result = wrappedData;
      expect(result).toHaveProperty('specversion');
      expect(result).toHaveProperty('type', 'dev.inspectr.http');
      expect(result).toHaveProperty('source', '/inspectr');
      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('time');
      expect(result).toHaveProperty('datacontenttype', 'application/json');
      expect(result).toHaveProperty('data');
      expect(result.data).toEqual((data));
      done();
    }, 100);
  });

  describe('print', () => {
    it('should log the request summary to the console', () => {
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {
      });
      const data = {
        response: { statusCode: 200 },
        request: { timestamp: '2025-02-14T00:00:00.000Z' },
        method: 'GET',
        path: '/sample',
        latency: 123

      };
      const returned = print(data);
      expect(logSpy).toHaveBeenCalledWith(
        `\x1b[42m200\x1b[0m - GET /sample (123ms) - 2025-02-14T00:00:00.000Z`
      );
      expect(returned).toEqual(data);
      logSpy.mockRestore();
    });
  });

  describe('getBgColor', () => {
    it('should return green for status codes between 200 and 299', () => {
      expect(getBgColor(200)).toBe('\x1b[42m');
      expect(getBgColor(250)).toBe('\x1b[42m');
      expect(getBgColor(299)).toBe('\x1b[42m');
    });

    it('should return blue for status codes between 300 and 399', () => {
      expect(getBgColor(300)).toBe('\x1b[44m');
      expect(getBgColor(350)).toBe('\x1b[44m');
      expect(getBgColor(399)).toBe('\x1b[44m');
    });

    it('should return orange for status codes between 400 and 499', () => {
      expect(getBgColor(400)).toBe('\x1b[43m');
      expect(getBgColor(450)).toBe('\x1b[43m');
      expect(getBgColor(499)).toBe('\x1b[43m');
    });

    it('should return red for status codes 500 and above', () => {
      expect(getBgColor(500)).toBe('\x1b[41m');
      expect(getBgColor(550)).toBe('\x1b[41m');
    });

    it('should return an empty string for status codes below 200', () => {
      expect(getBgColor(100)).toBe('');
    });
  });

  describe('capture', () => {
    it('should capture request and response data and return a data object', async () => {
      // Create a fake request with JSON content.
      const jsonContent = '{"message":"hello"}';
      const headers = { 'content-type': ContentTypes.APPLICATION_JSON, host: 'localhost:3000' };
      const req = createRequest(jsonContent, 'POST', headers);
      req.originalUrl = '/api/capture?x=1';
      req.hostname = 'localhost:3000';
      req.ip = '127.0.0.1';

      // Create a fake response that captures writes.
      const res = new EventEmitter();
      let responseChunks = [];
      res.write = function(chunk) {
        responseChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      };
      res.end = function(chunk) {
        if (chunk) {
          responseChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        res.statusCode = 200;
        // For getHeaders fallback.
        res.getHeaders = () => ({ 'content-type': 'application/json' });
        process.nextTick(() => res.emit('finish'));
      };

      // Triggers res.end() to simulate response completion.
      const next = () => {
        res.end();
      };

      // Call capture with options to disable broadcast and printing.
      const data = await capture(req, res, next, { broadcast: false, print: false });

      // Verify properties in the captured data.
      expect(data).toHaveProperty('url', 'http://localhost:3000/api/capture?x=1');
      expect(data).toHaveProperty('path', '/api/capture');
      // The JSON parser returns an object, which is stringified in capture.
      expect(data.request.payload).toBe(JSON.stringify({ message: 'hello' }));
      expect(data).toHaveProperty('method', 'POST');
      // Since nothing was written to res in this test, the response payload is empty.
      expect(data.response.payload).toEqual('');
      expect(data.response).toHaveProperty('statusCode', 200);
      expect(data).toHaveProperty('latency');
      expect(data).toHaveProperty('timestamp');
    });

    it('should call next and reject when parseRequestBody errors', async () => {
      // Use invalid JSON so that the JSON parser fails.
      const invalidJson = 'invalid json';
      const headers = { 'content-type': ContentTypes.APPLICATION_JSON, host: 'localhost' };
      const req = createRequest(invalidJson, 'POST', headers);
      req.originalUrl = '/api/capture?x=error';
      req.hostname = 'localhost';
      req.ip = '127.0.0.1';

      // Fake response – its details won’t matter here.
      const res = new EventEmitter();
      res.write = () => {
      };
      res.end = function() {
        process.nextTick(() => res.emit('finish'));
      };

      let nextCalled = false;
      const next = () => {
        nextCalled = true;
        res.end();
      };

      await expect(capture(req, res, next, { broadcast: false, print: false }))
        .rejects.toThrow();
      expect(nextCalled).toBe(true);
    });

    it.skip('should call broadcast and print when options are enabled', async () => {
      // Use spies on the exported functions.
      const broadcastSpy = jest.spyOn(inspectr, 'broadcast');
      const printSpy = jest.spyOn(inspectr, 'print');

      // Create a fake request with JSON content.
      const jsonContent = '{"message":"hello"}';
      const headers = { 'content-type': ContentTypes.APPLICATION_JSON, host: 'localhost' };
      const req = createRequest(jsonContent, 'POST', headers);
      req.originalUrl = '/api/capture?x=2';
      req.hostname = 'localhost';
      req.ip = '127.0.0.1';

      // Create a fake response that captures writes.
      const res = new EventEmitter();
      res.write = () => {
      };
      res.end = function() {
        res.statusCode = 200;
        res.getHeaders = () => ({ 'content-type': 'application/json' });
        process.nextTick(() => res.emit('finish'));
      };

      const next = () => {
        res.end();
      };

      // Call capture with both broadcast and print enabled.
      await capture(req, res, next, { broadcast: true, print: true });

      // Now assert that our spies were called.
      // expect(broadcastSpy).toHaveBeenCalled();
      expect(printSpy).toHaveBeenCalled();

      broadcastSpy.mockRestore();
      printSpy.mockRestore();
    });
  });

});
