import http from 'k6/http';
import { check } from 'k6';
import { getHeaders } from '../login_token.js';

export const options = {
  vus: 1,
  duration: '10s',
};

export default function () {
  const url = 'https://teammates-orugas.appspot.com/webapi/account/requests?status=PENDING';

  const res = http.get(url, getHeaders());

  check(res, {
    'Status 200 OK': (r) => r.status === 200,
    'Tiempo de respuesta ≤ 2s': (r) => r.timings.duration <= 2000,
    'Respuesta contiene datos': (r) => r.body && r.body.length > 0,
  });
}
