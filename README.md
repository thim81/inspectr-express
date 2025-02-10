# Request Inspector for Express

**Request Inspector** is an NPM package that provides middleware for Express applications to capture and inspect every incoming request and outgoing response. It also includes a built‑in Inspector UI (accessible at [http://localhost:4004](http://localhost:4004)) where you can view details in real time—similar in spirit to Ngrok’s inspector.

<img src="https://raw.githubusercontent.com/thim81/express-request-inspector/main/assets/express-inspector-screenshot.png" alt="Express Request Inspector" width="80%">

## Features

- **Middleware**: Intercepts HTTP requests and responses and webhooks.
- **Real-time Inspector**: Inspect Requests & Responses in an inspector UI.
- **Log Requests**: Log request data to the console.
- **Easy Integration**: Simply add the middleware to your Express app.

## Installation

Install the package via npm:

```bash
npm install request-inspector-express
```

## Usage

1. Integrate the Inspector Middleware into Your Express Application

In your Express application, require the package and use the middleware. For example:

 ```js
 // app.js
 const express = require('express');
 const inspector = require('request-inspector-').capture;
 
 const app = express();

// (Optional)Set the broadcast URL for Inspector.
// inspector.setBroadcastUrl('http://localhost:4004/sse');
 
 // Add the inspector middleware BEFORE your routes
 app.use((req, res, next) => {
     inspector(req, res, next, { broadcast: true, print: true })
         .then(data => {
             // Optionally, process the captured data (e.g., log it)
             console.log('Captured data:', data);
     })
     .catch(err => {
         console.error('Inspector error:', err);
         next(err);
     });
 });
 
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

| Option      | Type    | Default | Description                                                                                      |
|:------------|:--------|:--------|:-------------------------------------------------------------------------------------------------|
| `broadcast` | boolean | `true`  | If true, sends request/response data to the WebSocket for real-time viewing in the Inspector UI. |
| `print`     | boolean | `true`  | If true, logs request/response details to the console in a structured format.                    |


Examples
Enable only console logging (disable WebSocket broadcasting):
```js
app.use((req, res, next) => {
 inspector.capture(req, res, next, { broadcast: false, print: true });
});
```
Enable only WebSocket broadcasting (disable console logging):
```js
app.use((req, res, next) => {
 inspector.capture(req, res, next, { broadcast: true, print: false });
});
```

Use default behavior (both enabled):
```js
app.use(inspector.capture);
```

3. Run the Inspector UI

The Inspector UI is provided as a separate command-line tool that serves the UI on port 4004. Once your app is running (and using the middleware), you can start the Inspector UI in another terminal:

If you installed the package locally:
 
```bash
 npx request-inspector
```

Or, if installed globally:
 
```bash
 request-inspector
```

or as package.json script

```bash
"scripts": {
 "inspector": "request-inspector"
}
```

Then open your browser to http://localhost:4004 to view the inspector interface.