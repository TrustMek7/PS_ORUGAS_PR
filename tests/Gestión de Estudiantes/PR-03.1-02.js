import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Counter } from 'k6/metrics';
import { getHeadersWithCSRF } from '../login_token.js';

const courseLoadDuration = new Trend('course_load_duration');
const studentLoadDuration = new Trend('student_load_duration');
const studentsPerCourse = new Trend('students_per_course');
const coursesOver1000 = new Counter('courses_over_1000_students');
const failedCourseLoads = new Counter('failed_course_requests');

export const options = {
  vus: 1,
  iterations: 1,
  thresholds: {
    'http_req_failed': ['rate<0.05'],
    'student_load_duration': ['p(95)<5000'],
  },
   tags: {
    modulo: 'Gestión de Estudiantes',
  },
};

export default function () {
  const courseUrl = 'https://teammates-orugas.appspot.com/webapi/courses?entitytype=instructor&coursestatus=active';
  const courseRes = http.get(courseUrl, { headers: getHeadersWithCSRF() });

  check(courseRes, {
    '✅ PR-03.1-02: Cursos - Status 200 OK': (r) => r.status === 200,
  }) || failedCourseLoads.add(1);

  let courses = [];
  try {
    const data = JSON.parse(courseRes.body);
    courses = Array.isArray(data.courses) ? data.courses : data;
  } catch (e) {
    console.log('❌ Error parseando cursos:', e.message);
  }

  console.log(`📚 Cursos encontrados: ${courses.length}`);

  for (let i = 0; i < courses.length; i++) {
    const course = courses[i];
    const courseId = course.id || course.courseid || course.courseId;
    if (!courseId) continue;

    const studentsUrl = `https://teammates-orugas.appspot.com/webapi/students?courseid=${courseId}`;
    const res = http.get(studentsUrl, { headers: getHeadersWithCSRF() });
    const responseTime = res.timings.duration;
    studentLoadDuration.add(responseTime);

    let cantidad = 0;
    
    let success = check(res, {
      '✅ PR-03.1-02: Status 200 OK': (r) => r.status === 200,
      '✅ PR-03.1-02: Tiempo ≤ 2s': (r) => r.timings.duration <= 2000,
      '✅ PR-03.1-02: JSON válido': (r) => {
        try {
          JSON.parse(r.body);
          return true;
        } catch {
          return false;
        }
      },
      '✅ PR-03.1-02: Lista sin errores ni cortes': (r) => {
        try {
          const json = JSON.parse(r.body);
          return !json.error && json.students !== undefined;
        } catch {
          return false;
        }
      },
    });

    try {
      const responseData = JSON.parse(res.body);
      
      // El endpoint devuelve un objeto con la propiedad 'students' que es un array
      if (responseData.students && Array.isArray(responseData.students)) {
        cantidad = responseData.students.length;
      } else {
        cantidad = 0;
      }
      
      studentsPerCourse.add(cantidad);
      if (cantidad > 1000) coursesOver1000.add(1);
    } catch (e) {
      console.log(`❌ Error parseando estudiantes para curso ${courseId}:`, e.message);
    }

    console.log(`📘 Curso ${i + 1} (ID: ${courseId}): ${cantidad} estudiantes | ${responseTime}ms`);
    sleep(0.5);
  }
}

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
  🎯 PR-03.1-02: VISUALIZACIÓN - CARGAR LISTA DE ESTUDIANTES EN UN CURSO
═══════════════════════════════════════════════════════════════════════════════
  📊 RESUMEN: ${stats.checksExitosos}/${stats.checksTotal} checks (${exitoTotal}%)
  🌐 HTTP: ${stats.requestsTotal} requests, ${stats.requestsFallidos}% fallidos, ${stats.duracionPromedio}ms promedio
  ⏱️ TIEMPO: ${stats.tiempoTotal}s total, ${stats.iteraciones} iteraciones
  🎯 OBJETIVO: Verificar visualización fluida con gran volumen
═══════════════════════════════════════════════════════════════════════════════
`
  };
}
