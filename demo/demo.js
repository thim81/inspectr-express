// demo.js
const express = require('express');
const inspectr = require('../lib/inspectr');

const app = express();

const PORT = process.env.PORT || 4005;

// (Optional)Set the broadcast URL for Inspectr.
inspectr.setBroadcastUrl(`http://localhost:4004/sse`);

// Use Inspectr middleware for all routes.
app.use((req, res, next) => {
  inspectr.capture(req, res, next, { broadcast: true, print: true })
    .then(data => {
      // Log inspectr object
      // console.log('Captured:', data);
    })
    .catch(err => {
      console.error('Capture error:', err);
    });
});

// (Optional) You can add any standard middleware or routes below.

// A test route for demonstration.
app.get('/test', (req, res) => {
  res.json({ message: 'This is a test endpoint.' });
});

app.get('/api', (req, res) => {
  res.status(200).send('Welcome to Inspectr, Simplifying API and Webhook debugging!');
});

app.get('/api/services/inspectr', (req, res) => {
  res.status(200).json({ name: 'Inspectr demo', version: '1.0.1' });
});

app.post('/api/services/inspectr', (req, res) => {
  const { message, user } = req.body;
  if (!message || !user) {
    return res.status(400).json({ error: 'Message and user are required' });
  }
  res.status(200).json({ name: 'Inspectr', version: '1.0.0' }); // Replace with real data
});

app.put('/api/services/inspectr', (req, res) => {
  const { name, version } = req.body;
  if (!name && !version) {
    return res.status(400).json({ error: 'Name or version is required' });
  }
  const data = req.body;
  res.status(200).json({ message: 'Service updated', data: data });
});

app.delete('/api/services/inspectr', (req, res) => {
  res.status(204).send();
});

app.get('/api/ping', (req, res) => {
  res.status(200).send('Pong');
});

app.post('/api/pong', (req, res) => {
  res.status(405).send('Method Not Allowed');
});

app.get('/api/versions', (req, res) => {
  res.status(200).json({ version: '1.0.0', build: '1234' });
});

app.get('/changelog', (req, res) => {
  res.redirect(302, '/api/versions');
});

app.get('/docs/pricing', (req, res) => {
  res.status(404).send('Not Found');
});

app.get('/error', (req, res) => {
  try {
    undefinedVariable.toString(); // Simulate an error
  } catch (error) {
    res.status(500).send('Internal Server Error');
  }
});


// Start the server.
app.listen(PORT, () => {
  console.log(`Express Demo is available on http://localhost:${PORT}`);
});
