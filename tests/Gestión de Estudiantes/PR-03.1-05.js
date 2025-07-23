import http from 'k6/http';
import { check } from 'k6';
import { Trend, Counter } from 'k6/metrics';
import { getHeadersWithCSRF } from '../login_token.js';

const enrollDuration = new Trend('enroll_duration');
const studentsEnrolled = new Counter('students_enrolled');
const failedEnrolls = new Counter('failed_enrolls');

export const options = {
  vus: 1,
  iterations: 1,
  thresholds: {
    'http_req_failed': ['rate<0.05'],
    'enroll_duration': ['p(95)<4000'],
  },
   tags: {
    modulo: 'Gestión de Estudiantes',
  },
};

// Cargar datos de estudiantes desde archivo JSON
const studentsData = JSON.parse(open('./Students.json'));

function getRandomStudents(count = 5) {
  const shuffled = [...studentsData.students].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count).map(student => ({
    ...student,
    email: `${student.email.split('@')[0]}.${Date.now()}.${Math.floor(Math.random() * 1000)}@example.com`
  }));
}

export default function () {
  console.log('🚀 PR-03.1-05: Enroll Masivo de Estudiantes');
  
  // Obtener cursos
  const courseRes = http.get('https://teammates-orugas.appspot.com/webapi/courses?entitytype=instructor&coursestatus=active', 
                            { headers: getHeadersWithCSRF() });
  
  const courses = courseRes.status === 200 ? JSON.parse(courseRes.body).courses || JSON.parse(courseRes.body) : [];
  console.log(`📚 Cursos: ${courses.length}`);

  if (courses.length === 0) return;

  const STUDENTS_PER_COURSE = 5;
  let totalEnrolled = 0;
  let totalFailed = 0;

  // Procesar solo el primer curso
  const courseId = courses[0].id || courses[0].courseid || courses[0].courseId;
  const students = getRandomStudents(STUDENTS_PER_COURSE);
  
  console.log(`👥 Añadiendo ${students.length} estudiantes a ${courseId}`);

  const payload = { studentEnrollRequests: students };
  const startTime = Date.now();
  
  const enrollRes = http.put(`https://teammates-orugas.appspot.com/webapi/students?courseid=${courseId}`, 
                            JSON.stringify(payload), {
    headers: { ...getHeadersWithCSRF(), 'Content-Type': 'application/json' }
  });
  
  const enrollTime = Date.now() - startTime;
  enrollDuration.add(enrollTime);

  const success = check(enrollRes, {
    '✅ Status 200 OK': (r) => r.status === 200,
    '✅ Tiempo ≤ 4s': () => enrollTime <= 4000,
  });

  if (enrollRes.status === 200) {
    studentsEnrolled.add(students.length);
    totalEnrolled = students.length;
    console.log(`✅ ${students.length} estudiantes añadidos | ${enrollTime}ms`);
    students.forEach((s, i) => console.log(`   ${i+1}. ${s.name} - ${s.section}/${s.team}`));
  } else {
    failedEnrolls.add(students.length);
    totalFailed = students.length;
    console.log(`❌ Error: Status ${enrollRes.status} | ${enrollTime}ms`);
    console.log(`📝 ${enrollRes.body.substring(0, 200)}...`);
  }

  // Validaciones finales
  check(null, {
    '✅ Tasa de éxito ≥ 80%': () => (totalEnrolled / students.length) >= 0.8,
    '✅ Al menos 1 estudiante añadido': () => totalEnrolled > 0,
  });

  console.log(`📊 Resultado: ${totalEnrolled}/${students.length} estudiantes (${((totalEnrolled/students.length)*100).toFixed(1)}%)`);
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
  🎯 PR-03.1-05: CARGA - AÑADIR MÚLTIPLES ESTUDIANTES CON "ENROLL"
═══════════════════════════════════════════════════════════════════════════════
  📊 RESUMEN: ${stats.checksExitosos}/${stats.checksTotal} checks (${exitoTotal}%)
  🌐 HTTP: ${stats.requestsTotal} requests, ${stats.requestsFallidos}% fallidos, ${stats.duracionPromedio}ms promedio
  ⏱️ TIEMPO: ${stats.tiempoTotal}s total, ${stats.iteraciones} iteraciones
  🎯 OBJETIVO: Validar reglas de validación y procesamiento masivo
═══════════════════════════════════════════════════════════════════════════════
`
  };
}
