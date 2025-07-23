import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Counter } from 'k6/metrics';
import { getHeadersWithCSRF } from '../login_token.js';

// Métricas personalizadas
const getCoursesDuration = new Trend('get_courses_duration');
const coursesCount = new Trend('courses_count');
const largeCourseListValidation = new Counter('large_course_list_validations');

export const options = {
  vus: 10,
  iterations: 15,
  thresholds: {
    'get_courses_duration': ['p(95)<5000'],
    'http_req_failed': ['rate<0.05'],
    'http_req_duration': ['p(95)<5000'],
    'courses_count': ['avg>=0'],
  },
  tags: {
    modulo: 'Gestión de Instructores',
  },
};

export default function () {
  const url = 'https://teammates-orugas.appspot.com/webapi/courses?entitytype=instructor&coursestatus=active';
  const res = http.get(url, { headers: getHeadersWithCSRF() });

  const responseTime = res.timings.duration;
  getCoursesDuration.add(responseTime);

  let coursesLength = 0;
  try {
    const data = JSON.parse(res.body);
    if (Array.isArray(data)) {
      coursesLength = data.length;
    } else if (data.courses && Array.isArray(data.courses)) {
      coursesLength = data.courses.length;
    } else if (data.length !== undefined) {
      coursesLength = data.length;
    }
    coursesCount.add(coursesLength);
  } catch (_) {}

  check(res, {
    '✅ PR-03.1-01: Status 200 OK': (r) => r.status === 200,
    '✅ PR-03.1-01: Tiempo de carga ≤ 2s': (r) => r.timings.duration <= 2000,
    '✅ PR-03.1-01: JSON válido': (r) => {
      try {
        JSON.parse(r.body);
        return true;
      } catch (_) {
        return false;
      }
    },
    '✅ PR-03.1-01: Respuesta válida': (r) => {
      try {
        const json = JSON.parse(r.body);
        return Array.isArray(json) || (json.courses && Array.isArray(json.courses));
      } catch {
        return false;
      }
    },
    '✅ PR-03.1-01: Lista cargada completamente': (r) => {
      try {
        const json = JSON.parse(r.body);
        return !json.error && !json.partial && (json.courses || Array.isArray(json));
      } catch {
        return false;
      }
    },
    '🎯 PR-03.1-01: IDEAL > 1000 cursos': (r) => {
      try {
        const json = JSON.parse(r.body);
        const count = json.courses ? json.courses.length : Array.isArray(json) ? json.length : 0;
        if (count > 1000) {
          largeCourseListValidation.add(1);
          return true;
        }
        return false;
      } catch {
        return false;
      }
    }
  });

  sleep(0.5);
}

// Resumen final
export function handleSummary(data) {
  const stats = {
    checksTotal: data.metrics.checks?.values.count || 0,
    checksExitosos: data.metrics.checks?.values.passes || 0,
    requestsTotal: data.metrics.http_reqs?.values.count || 0,
    requestsFallidos: Math.round((data.metrics.http_req_failed?.values.rate || 0) * 100),
    duracionPromedio: Math.round(data.metrics.http_req_duration?.values.avg || 0),
    tiempoTotal: (data.metrics.iteration_duration?.values.avg / 1000).toFixed(2),
    iteraciones: data.metrics.iterations?.values.count || 0
  };
  
  const checksFallidos = stats.checksTotal - stats.checksExitosos;
  const exitoTotal = stats.checksTotal > 0 ? Math.round((stats.checksExitosos / stats.checksTotal) * 100) : 0;

  return {
    'stdout': `
═══════════════════════════════════════════════════════════════════════════════
  🎯 PR-03.1-01: VISUALIZACIÓN - CARGAR LISTA DE CURSOS DEL INSTRUCTOR
═══════════════════════════════════════════════════════════════════════════════
  � RESUMEN: ${stats.checksExitosos}/${stats.checksTotal} checks (${exitoTotal}%)
  🌐 HTTP: ${stats.requestsTotal} requests, ${stats.requestsFallidos}% fallidos, ${stats.duracionPromedio}ms promedio
  ⏱️ TIEMPO: ${stats.tiempoTotal}s total, ${stats.iteraciones} iteraciones
  🎯 OBJETIVO: Evaluar rendimiento con múltiples cursos asignados
═══════════════════════════════════════════════════════════════════════════════
`
  };
}
