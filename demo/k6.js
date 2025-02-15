import http from 'k6/http';
import { sleep, check } from 'k6';

const BASE_URL = 'http://localhost:4005'; // Replace with your API base URL
// const BASE_URL = 'http://localhost:8080'; // Replace with your API base URL
// const BASE_URL = 'https://twelve-webs-send.loca.lt'; // Replace with your API base URL

// export const options = {
//   stages: [
//     { duration: '15s', target: 30 } // Ramp up to 30 requests per second over 15 seconds
//   ]
// };

export default function() {
  // Test /api
  let res = http.get(`${BASE_URL}/api`);
  check(res, {
    'status is 200': (r) => r.status === 200,
    'body contains welcome message': (r) => r.body.includes('Welcome to the API')
  });

  // Test /api/services/inspectr GET
  res = http.get(`${BASE_URL}/api/services/inspectr`);
  check(res, {
    'status is 200': (r) => r.status === 200,
    // 'content-type is application/json': (r) => r.headers['content-type'].includes('application/json'),
    'body contains service info': (r) => JSON.parse(r.body).name === 'Inspectr Service'
  });

  // Test /api/services/inspectr POST
  const pingRequest = JSON.stringify({ message: 'Welcome the Express Inspectr', user: 'Marco Polo' });
  res = http.post(`${BASE_URL}/api/services/inspectr`, pingRequest, { headers: { 'Content-Type': 'application/json' } });
  check(res, {
    'status is 200': (r) => r.status === 200,
    // 'content-type is application/json': (r) => r.headers['content-type'].includes('application/json'),
    'response body contains name': (r) => JSON.parse(r.body).name === 'Inspectr Service'
  });

  // Test /api/services/inspectr PUT
  const serviceInfo = JSON.stringify({ name: 'Updated Service', version: '2.0.0' });
  res = http.put(`${BASE_URL}/api/services/inspectr`, serviceInfo, { headers: { 'Content-Type': 'application/json' } });
  check(res, {
    'status is 200': (r) => r.status === 200,
    // 'content-type is application/json': (r) => r.headers['content-type'].includes('application/json'),
    'response body contains updated name': (r) => JSON.parse(r.body).name === 'Updated Service'
  });

  // Test /api/services/inspectr DELETE
  res = http.del(`${BASE_URL}/api/services/inspectr`);
  check(res, {
    'status is 204': (r) => r.status === 204
  });

  // Test /api/ping
  res = http.get(`${BASE_URL}/api/ping`);
  check(res, {
    'status is 200': (r) => r.status === 200,
    'body contains pong': (r) => r.body.includes('Pong')
  });

  // Test /api/pong
  res = http.post(`${BASE_URL}/api/pong`);
  check(res, {
    'status is 405': (r) => r.status === 405
  });

  // Test /api/versions
  res = http.get(`${BASE_URL}/api/versions`);
  check(res, {
    'status is 200': (r) => r.status === 200,
    // 'content-type is application/json': (r) => r.headers['content-type'].includes('application/json'),
    'response body contains version': (r) => JSON.parse(r.body).version === '1.0.0'
  });


  // Test /changelog (redirect)
  res = http.get(`${BASE_URL}/changelog`);
  check(res, {
    'status is 302': (r) => r.status === 302
  });

  // Test /docs/pricing (not found)
  res = http.get(`${BASE_URL}/docs/pricing`);
  check(res, {
    'status is 404': (r) => r.status === 404
  });

  // Test /error (500)
  res = http.get(`${BASE_URL}/error`);
  check(res, {
    'status is 500': (r) => r.status === 500
    // 'content-type is application/json': (r) => r.headers['content-type'].includes('application/json'),
    // 'response body contains error message': (r) => JSON.parse(r.body).error !== undefined
  });

  sleep(1); // Small pause between requests
}