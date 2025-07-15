import http from 'k6/http';
import { check } from 'k6';
import { getHeaders } from '../login_token.js';

export const options = {
  vus: 1,
  duration: '10s',
};

const url = 'https://teammates-orugas.appspot.com/webapi/account/requests?status=PENDING';

export default function () {
  const start = Date.now();
  const res = http.get(url, getHeaders());

  check(res, {
    '✅ Status 200 OK': (r) => r.status === 200,
    '✅ Contiene datos': (r) => r.body && r.body.length > 0,
    '✅ Tiempo ≤ 2s': (r) => r.timings.duration <= 2000,
  });

  if (res.status !== 200) return;

  let solicitudes = [];

  try {
    const data = JSON.parse(res.body);
    solicitudes = data.accountRequests?.slice(0, 300).map(r => r.id || r.accountRequestId || r.requestId) || [];
  } catch (e) {
    console.log('❌ Error al parsear JSON');
    return;
  }

  const processed = solicitudes.length;
  const elapsed = (Date.now() - start) / 1000;

  check({
    processed,
    elapsed,
  }, {
    '✅ Se procesaron ≥ 100': () => processed >= 100,
    '✅ Tiempo total ≤ 3s': () => elapsed <= 3,
  });

}
