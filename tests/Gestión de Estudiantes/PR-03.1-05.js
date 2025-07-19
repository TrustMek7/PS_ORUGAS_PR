import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Counter } from 'k6/metrics';
import { getHeadersWithCSRF } from '../login_token.js';

// Métricas personalizadas
const enrollDuration = new Trend('enroll_students_duration');
const enrollSuccess = new Counter('enroll_success');
const enrollFailure = new Counter('enroll_failure');

export const options = {
  vus: 1,
  iterations: 1,
  thresholds: {
    'http_req_failed': ['rate<0.05'],
    'enroll_students_duration': ['p(95)<4000'],
  },
};

// ⚠️ Ajusta este ID a uno válido para pruebas
const courseId = 'CURSO123';

function generarEstudiantes(cantidad) {
  const lista = [];
  for (let i = 1; i <= cantidad; i++) {
    lista.push({
      name: `Estudiante ${i}`,
      email: `est${i}@ejemplo.com`,
    });
  }
  return lista;
}

export default function () {
  const estudiantes = generarEstudiantes(1002);
  const payload = JSON.stringify(estudiantes);
  const url = `https://teammates-orugas.appspot.com/webapi/students?courseid=${courseId}`;

  const res = http.put(url, payload, {
    headers: {
      ...getHeadersWithCSRF(),
      'Content-Type': 'application/json',
    },
  });

  enrollDuration.add(res.timings.duration);

  const success = check(res, {
    '✅ Status 200 OK': (r) => r.status === 200,
    '✅ Tiempo ≤ 4s': (r) => r.timings.duration <= 4000,
    '✅ JSON válido': (r) => {
      try {
        JSON.parse(r.body);
        return true;
      } catch {
        return false;
      }
    },
    '✅ Todos enrolados': (r) => {
      try {
        const json = JSON.parse(r.body);
        return json.success === true || json.added === estudiantes.length;
      } catch {
        return false;
      }
    },
  });

  if (success) {
    enrollSuccess.add(1);
    console.log(`✅ Enrolamiento exitoso de ${estudiantes.length} estudiantes`);
  } else {
    enrollFailure.add(1);
    console.log(`❌ Fallo en enrolamiento`);
    console.log(res.body);
  }

  sleep(1);
}

export function teardown(data) {
  console.log('\n' + '='.repeat(60));
  console.log('📊 RESUMEN FINAL - PR-03.1-05: Enrolar Estudiantes');
  console.log('='.repeat(60));
  console.log(`👥 Total intentado: 1002 estudiantes`);
  console.log(`✅ Éxitos: ${data.metrics.enroll_success.values.count}`);
  console.log(`❌ Fallos: ${data.metrics.enroll_failure.values.count}`);
  console.log(`⏱️  Promedio de tiempo: ${Math.round(data.metrics.enroll_students_duration.values.avg)}ms`);
  console.log('='.repeat(60) + '\n');
}
