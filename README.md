# Request Inspector for Express

**Inspectr** is an NPM package that provides middleware for Express applications to capture and inspect every incoming request and outgoing response. It also includes a built‑in Inspectr UI (accessible at [http://localhost:4004](http://localhost:4004)) where you can view request & response details in real time.

<img src="https://raw.githubusercontent.com/thim81/inspectr/main/assets/inspectr-app.png" alt="Request Inspector" width="80%">

## Features

- **Middleware**: Intercepts HTTP requests and responses and webhooks.
- **Real-time Inspector**: Inspect Requests & Responses in an Inspectr UI.
- **Log Requests**: Log request data to the console.
- **Easy Integration**: Simply add the middleware to your Express app.

## Installation

Install the package via npm:

```bash
npm install inspectr-express
```

## Usage

1. Integrate the Inspectr Middleware into Your Express Application

In your Express application, require the package and use the middleware. For example:

 ```js
 // app.js
 const express = require('express');
 const inspectr = require('inspectr').capture;
 
 const app = express();

// (Optional)Set the broadcast URL for Inspector.
// inspectr.setBroadcastUrl('http://localhost:4004/sse');
 
 // Add the inspectr middleware BEFORE your routes
 app.use((req, res, next) => {
     inspectr(req, res, next, { broadcast: true, print: true })
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
 inspectr.capture(req, res, next, { broadcast: false, print: true });
});
```
Enable only WebSocket broadcasting (disable console logging):
```js
app.use((req, res, next) => {
 inspectr.capture(req, res, next, { broadcast: true, print: false });
});
```

Use default behavior (both enabled):
```js
app.use(Inspectr.capture);
```

3. Run the Inspectr UI

The Inspectr UI is provided as a separate command-line tool that serves the UI on port 4004. Once your app is running (and using the middleware), you can start the Inspectr UI in another terminal:

If you installed the package locally:
 
```bash
 npx inspectr
```

Or, if installed globally:
 
```bash
 inspectr
```

or as package.json script

```bash
"scripts": {
 "inspectr": "inspectr"
}
```

Then open your browser to http://localhost:4004 to view the inspectr interface.