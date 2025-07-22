import http from 'k6/http';
import { check } from 'k6';
import { SharedArray } from 'k6/data';
import { getHeadersWithCSRF } from '../login_token.js';

export const options = {
  vus: 1,
  iterations: 500, 
  thresholds: {
    'http_req_duration': ['p(95)<1000'], // Tiempo ≤ 1s por lote
    'http_req_failed': ['rate<0.05'],
  },
};

// Cargamos los instructores desde archivo JSON externo
const instructores = new SharedArray('instructores_individuales', function() {
  try {
    const data = JSON.parse(open('./instructores_500.json'));
    return data;
  } catch (error) {
    console.error(`Error al leer archivo JSON: ${error}`);
    return [
      {
        instructorName: 'Test Instructor',
        instructorEmail: 'test@example.com',
        instructorInstitution: 'TEST'
      }
    ];
  }
});

const startTime = Date.now();

export default function () {
  const index = __ITER % instructores.length;
  const instructor = instructores[index];

  const payload = JSON.stringify(instructor);

  const headers = getHeadersWithCSRF();

  const res = http.post('https://teammates-orugas.appspot.com/webapi/account/request', payload, { headers });

  const exitoso = check(res, {
    '✅ Status 200 o 201': (r) => r.status === 200 || r.status === 201,
    '✅ Contiene correo': (r) => r.body && r.body.includes(instructor.instructorEmail),
  });

  if (!exitoso) {
    console.warn(`❌ Error con ${instructor.instructorEmail} | Status: ${res.status}`);
  }
}

export function handleSummary(data) {
  const totalDuracion = Date.now() - startTime;
  const iteraciones = data.metrics.iterations.values.count || 0;
  const exitosos = data.metrics.checks.values.passes || 0;
  const fallidos = data.metrics.checks.values.fails || 0;
  const total = iteraciones;
  const promedio = Math.round(data.metrics.http_req_duration?.values?.avg || 0);

  console.log('\n' + '═'.repeat(79));
  console.log('  📘 PR-01.2-01: AÑADIR INSTRUCTOR INDIVIDUAL');
  console.log('═'.repeat(79));
  console.log(`  🧪 SOLICITUDES REALIZADAS: ${total}`);
  console.log(`  📬 SOLICITUDES EXITOSAS: ${exitosos} (${total > 0 ? ((exitosos / (exitosos + fallidos)) * 100).toFixed(1) : '0.0'}%)`);
  console.log(`  ❌ SOLICITUDES FALLIDAS: ${fallidos}`);
  console.log(`  ⏱️  TIEMPO PROMEDIO POR LOTE: ${promedio}ms`);
  console.log(`  ⌛ TIEMPO TOTAL: ${Math.round(totalDuracion / 1000)}s`);

  if (fallidos === 0 && promedio <= 1000 && totalDuracion <= 500000) {
    console.log(`  ✅ VALIDACIÓN: Dentro del umbral de tiempo y errores aceptables`);
  } else {
    console.log(`  ⚠️ VALIDACIÓN: Algunos valores exceden el umbral definido`);
  }

  console.log(`  📋 NOTA: Datos cargados desde instructores_individuales.json`);
  console.log('═'.repeat(79) + '\n');

  return {};
}
