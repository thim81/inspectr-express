#!/usr/bin/env node

// bin/inspectr.js
const express = require('express');
const http = require('http');
const path = require('path');
const { generateUUID, wrapInCloudEvent } = require('../lib/inspectr');

const app = express();
const PORT = process.env.PORT || 4004;
const server = http.createServer(app);

// Array to hold connected SSE clients.
let clients = [];

// Inspectr front-end App
const distPath = path.join(__dirname, '../node_modules/@inspectr/app/dist');

// --- Methods

// Function to broadcast messages to all connected SSE clients.
function broadcast(data) {
  let event;

  // Check if data is a CloudEvent.
  if (typeof data === 'object' && data !== null && data.specversion) {
    event = data;
  } else {
    event = wrapInCloudEvent(data);
  }

  const json = typeof data === 'string' ? data : JSON.stringify(event);
  clients.forEach((client) => {
    client.res.write(`data: ${json}\n\n`);
  });
}

// --- API Endpoints

// SSE endpoint that clients can connect to.
app.get('/api/sse', (req, res) => {
  // Set headers for SSE
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive'
  });

  // Send a comment to keep the connection alive immediately.
  res.write(`: connected\n\n`);

  // Create a unique ID for this client.
  const clientId = `express-${generateUUID()}`;
  const newClient = {
    id: clientId,
    res
  };
  clients.push(newClient);
  console.log(`🟢 SSE Inspectr client connected: ${clientId}. Total clients: ${clients.length}`);

  // Remove client when connection is closed.
  req.on('close', () => {
    console.log(`🔴 SSE Inspectr client disconnected: ${clientId}`);
    clients = clients.filter((client) => client.id !== clientId);
  });
});

// SSE endpoint to broadcast to all connected SSE clients.
app.use(express.json());
app.post('/api/sse', (req, res) => {
  const message = req.body;
  broadcast(message);
  res.status(200).send('Broadcast sent');
});

// API health endpoint
app.get('/api/health', (req, res) => {
  const data = {
    message: 'Ok',
    date: new Date()
  };

  res.status(200).send(data);
});

// API endpoint to replay an Inspectr Request event.
app.post('/api/replay', async (req, res) => {
  const event = req.body;

  // Validate that the event includes at least a method and a url.
  if (!event || !event.method || !event.url) {
    return res.status(422).json({ error: 'Invalid Inspectr Request event' });
  }

  // Extract request details.
  const { method, url, request } = event;
  const payload = request && request.payload ? request.payload : undefined;
  const headers = request && request.headers ? request.headers : {};

  // console.log(`Replaying request: ${method} ${url}`);

  try {
    // Replay the request using fetch.
    const response = await fetch(url, {
      method,
      headers,
      body: method !== 'GET' && method !== 'HEAD' ? payload : undefined
    });

    // Retrieve the response as text.
    const responseBody = await response.text();

    res.status(response.status).json({
      success: true,
      status: response.status,
      data: responseBody
    });
  } catch (error) {
    console.error('Inspectr Replay request failed:', error);
    res.status(500).json({ error: error.toString() });
  }
});

// Serve static files (including your UI) from the 'public' folder.
app.use(express.static(distPath));

// Start the Express Inspectr server.
server.listen(PORT, () => {
  console.log(`🚀 Inspectr App available at http://localhost:${PORT}`);
  console.log(`🔧 Use Inspectr SSE Endpoint http://localhost:${PORT}/api/sse`);
});
