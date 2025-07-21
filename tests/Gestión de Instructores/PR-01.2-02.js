import http from 'k6/http';
import { check } from 'k6';
import { SharedArray } from 'k6/data';
import { getHeadersWithCSRF } from '../login_token.js';

export const options = {
  vus: 100, // Simula 100 usuarios simultáneos
  duration: '1m', // Duración total de la prueba
  thresholds: {
    'http_req_duration': ['p(95)<1000'], // 95% de las solicitudes deben responder en menos de 1 segundo
    'http_req_failed': ['rate<0.05'],    // Menos del 5% de errores permitidos
  },
};

// Generamos dinámicamente 100 instructores únicos
const instructores = Array.from({ length: 100 }, (_, i) => ({
  instructorName: `Instructor ${i + 1}`,
  instructorEmail: `instructor${i + 1}@example.com`,
  instructorInstitution: `Institución ${Math.floor(i / 10) + 1}`
}));


const startTime = Date.now();

export default function () {
  const index = __ITER % instructores.length;
  const instructor = instructores[index];

  const payload = JSON.stringify({
    instructorName: instructor.instructorName,
    instructorEmail: instructor.instructorEmail,
    instructorInstitution: instructor.instructorInstitution,
  });

  const headers = getHeadersWithCSRF();

  const res = http.post('https://teammates-orugas.appspot.com/webapi/account/request', payload, { headers });

  const exitoso = check(res, {
    '✅ Status 200 o 201': (r) => r.status === 200 || r.status === 201,
    '✅ Contiene correo': (r) => r.body && r.body.includes(instructor.instructorEmail),
  });

  if (!exitoso) {
    console.warn(`❌ [VU ${__VU}] Error con ${instructor.instructorEmail} | Status: ${res.status}`);
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
  console.log('  📘 PR-01.2-02: AÑADIR INSTRUCTOR INDIVIDUAL - MÚLTIPLES USUARIOS');
  console.log('═'.repeat(79));
  console.log(`  🧪 SOLICITUDES REALIZADAS: ${total}`);
  console.log(`  📬 SOLICITUDES EXITOSAS: ${exitosos} (${total > 0 ? ((exitosos / (exitosos + fallidos)) * 100).toFixed(1) : '0.0'}%)`);
  console.log(`  ❌ SOLICITUDES FALLIDAS: ${fallidos}`);
  console.log(`  ⏱️  TIEMPO PROMEDIO POR LOTE: ${promedio}ms`);
  console.log(`  ⌛ TIEMPO TOTAL: ${Math.round(totalDuracion / 1000)}s`);
  console.log(`  👥 USUARIOS CONCURRENTES: 5 VUs (testing - configurar a 100 para producción)`);

  if (fallidos === 0 && promedio <= 500 && totalDuracion <= 300000) {
    console.log(`  ✅ VALIDACIÓN: Dentro del umbral de tiempo y errores aceptables`);
  } else {
    console.log(`  ⚠️ VALIDACIÓN: Algunos valores exceden el umbral definido`);
  }

  console.log(`  📋 NOTA: Prueba de estrés con 100 usuarios concurrentes simultáneos`);
  console.log('═'.repeat(79) + '\n');

  return {};
}
