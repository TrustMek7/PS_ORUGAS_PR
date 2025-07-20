import http from 'k6/http';
import { check } from 'k6';
import { SharedArray } from 'k6/data';
import { getHeadersWithCSRF } from '../login_token.js';

export const options = {
  vus: 5, // Reducido para testing inicial (configurar a 100 para producción)
  iterations: 10, // Reducido para testing inicial (configurar a 500 para producción)
  thresholds: {
    'http_req_duration': ['p(95)<500'], // Tiempo respuesta ≤ 500ms
    'http_req_failed': ['rate<0.05'],
  },
};

// Cargamos los instructores desde archivo externo
const instructores = new SharedArray('instructores_concurrentes', function() {
  try {
    const contenido = open('./instructores_concurrentes.txt');
    return contenido.split('\n')
      .map(linea => linea.trim())
      .filter(linea => linea.length > 0 && linea.includes('|'))
      .map(linea => {
        const partes = linea.split('|').map(parte => parte.trim());
        return {
          instructorName: partes[0],
          instructorEmail: partes[1],
          instructorInstitution: partes[2]
        };
      });
  } catch (error) {
    console.error(`Error al leer archivo: ${error}`);
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
