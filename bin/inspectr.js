// bin/inspectr.js
const express = require('express');
const http = require('http');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 4004;
const server = http.createServer(app);

// Array to hold connected SSE clients.
let clients = [];

// Inspector front-end App
const distPath = path.join(__dirname, '../node_modules/@inspectr/app/dist');

// --- API Endpoints

// Function to broadcast messages to all connected SSE clients.
function broadcast(data) {
    // Ensure data is in string format
    const json = typeof data === 'string' ? data : JSON.stringify(data);
    clients.forEach(client => {
        client.res.write(`data: ${json}\n\n`);
    });
}

// --- API Endpoints

// SSE endpoint that clients can connect to.
app.get('/sse', (req, res) => {
    // Set headers for SSE
    res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive"
    });

    // Send a comment to keep the connection alive immediately.
    res.write(`: connected\n\n`);

    // Create a unique ID for this client.
    const clientId = Date.now();
    const newClient = {
        id: clientId,
        res
    };
    clients.push(newClient);
    console.log(`SSE Inspector client connected: ${clientId}. Total clients: ${clients.length}`);

    // Remove client when connection is closed.
    req.on('close', () => {
        console.log(`SSE Inspector client disconnected: ${clientId}`);
        clients = clients.filter(client => client.id !== clientId);
    });
});

// SSE endpoint to broadcast to all connected SSE clients.
app.use(express.json());
app.post('/sse', (req, res) => {
    const message = req.body;
    broadcast(message);
    res.status(200).send("Broadcast sent");
});

// Serve static files (including your UI) from the 'public' folder.
app.use(express.static(distPath));

// Start the Express Inspector server.
server.listen(PORT, () => {
    console.log(`🚀 Request Inspector available at http://localhost:${PORT}`);
    console.log(`🔧 Use SSE Endpoint:http://localhost:${PORT}/sse`);
});
