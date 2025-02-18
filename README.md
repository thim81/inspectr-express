# Inspectr for Express

**Inspectr** is a NPM package that provides middleware for Express applications to capture and inspect every incoming
request and outgoing response. It also includes a built‑in Inspectr UI (accessible
at [http://localhost:4004](http://localhost:4004)) where you can view request & response details in real time.

<img src="https://raw.githubusercontent.com/thim81/inspectr/main/assets/inspectr-app.png" alt="Request Inspectr" width="80%">

<img src="https://raw.githubusercontent.com/thim81/inspectr/main/assets/inspectr-console.png" alt="Console Inspectr" width="80%">

## Features

- **Express Middleware**: Intercepts HTTP requests and responses and webhooks.
- **Real-time Inspector**: Inspect Requests & Responses in the Inspectr App.
- **Log Requests**: Log request data to the console.
- **Easy Integration**: Simply add the middleware to your Express app.

## Installation

Install the package via npm:

```bash
npm install @inspectr/express
```

## Usage

1. Integrate the Inspectr Middleware into Your Express Application

In your Express application, require the package and use the middleware. For example:

 ```js
 // app.js
const express = require('express');
const inspectr = require('@inspectr/express');

const app = express();

// (Optional)Set the broadcast URL for Inspectr.
// inspectr.setBroadcastUrl('http://localhost:4004/sse');

// Add the inspectr middleware BEFORE your routes
app.use(inspectr.capture);

// Define your routes
app.get('/', (req, res) => {
  res.send('Hello, world!');
});

// Start your Express server as usual
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Express app listening on port ${PORT}`);
});
 ```

2. Configuration Options

The capture() function accepts an optional configuration object to control how request and response data is handled:

| Option      | Type    | Default | Description                                                                                |
|:------------|:--------|:--------|:-------------------------------------------------------------------------------------------|
| `broadcast` | boolean | `true`  | If true, sends request/response data to the SSE for real-time viewing in the Inspectr App. |
| `print`     | boolean | `true`  | If true, logs request/response details to the console in a structured format.              |

Examples
Enable only console logging (disable SSE broadcasting):

```js
app.use((req, res, next) => {
  inspectr.capture(req, res, next, { broadcast: false, print: true });
});
```

Enable only SSE broadcasting (disable console logging):

```js
app.use((req, res, next) => {
  inspectr.capture(req, res, next, { broadcast: true, print: false });
});
```

Or access the data directly

```js
// Add the inspectr middleware BEFORE your routes
app.use((req, res, next) => {
  inspectr(req, res, next, { broadcast: true, print: true })
    .then(data => {
      // Optionally, process the captured data (e.g., log it)
      console.log('Captured data:', data);
    })
    .catch(err => {
      console.error('Inspectr error:', err);
      next(err);
    });
});
```

Use default behavior (both enabled):

```js
app.use(inspectr.capture);
```

3. Run the Inspectr App

The Inspectr App is provided as a separate command-line tool that serves the App on port 4004. Once your app is
running (
and using the middleware), you can start the Inspectr App in another terminal:

If you installed the package locally:

```bash
  @inspectr/express
```

or as package.json script

```bash
"scripts": {
 "inspectr-app": "inspectr"
}
```

Then open your browser to http://localhost:4004 to view the inspectr interface.

<img src="https://raw.githubusercontent.com/thim81/inspectr/main/assets/inspectr-app.png" alt="Request Inspectr" width="80%">