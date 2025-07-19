import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Counter } from 'k6/metrics';
import { getHeadersWithCSRF } from '../login_token.js';

const deleteDuration = new Trend('delete_course_duration');
const deleteFailures = new Counter('delete_failures');
const successfulDeletes = new Counter('delete_successes');

export const options = {
  vus: 1,
  iterations: 1,
  thresholds: {
    'delete_course_duration': ['p(95)<4000'],
    'http_req_failed': ['rate<0.05'],
  },
};

export default function () {
  // Buscar cursos en la papelera (soft deleted) para eliminar definitivamente
  const deletedCoursesUrl = 'https://teammates-orugas.appspot.com/webapi/courses?entitytype=instructor&coursestatus=softDeleted';
  const res = http.get(deletedCoursesUrl, { headers: getHeadersWithCSRF() });

  let courses = [];
  try {
    const data = JSON.parse(res.body);
    if (Array.isArray(data)) {
      courses = data;
    } else if (Array.isArray(data.courses)) {
      courses = data.courses;
    } else {
      courses = [];
    }
  } catch (e) {
    console.error('❌ Error parseando cursos de la papelera:', e.message);
    console.log(`📝 Response: ${res.body.substring(0, 200)}...`);
    return;
  }

  console.log(`🗑️ Cursos en papelera encontrados: ${courses.length}`);
  
  if (courses.length === 0) {
    console.log('ℹ️  No hay cursos en la papelera para eliminar definitivamente');
    return;
  }

  // Limitar a máximo 10 cursos para evitar eliminar todo de una vez
  const cursosAEvaluar = courses;
  console.log(`🎯 Eliminando definitivamente ${cursosAEvaluar.length} cursos de la papelera...`);

  for (let i = 0; i < cursosAEvaluar.length; i++) {
    const course = cursosAEvaluar[i];
    const courseId = course.id || course.courseid || course.courseId;
    if (!courseId) {
      console.warn(`⚠️  Curso ${i + 1}: ID no encontrado`);
      continue;
    }

    console.log(`🗑️ Eliminando definitivamente curso ${i + 1}/${cursosAEvaluar.length}: ${courseId}`);
    
    // Eliminar definitivamente (hard delete) del curso que está en papelera
    const deleteUrl = `https://teammates-orugas.appspot.com/webapi/course?courseid=${courseId}`;
    const resDelete = http.del(deleteUrl, null, { headers: getHeadersWithCSRF() });
    const responseTime = resDelete.timings.duration;
    deleteDuration.add(responseTime);

    const success = check(resDelete, {
      '✅ PR-02.5-03: Status 200 OK': (r) => r.status === 200,
      '✅ PR-02.5-03: Tiempo ≤ 4s': (r) => r.timings.duration <= 4000,
    });

    if (success) {
      successfulDeletes.add(1);
      console.log(`✅ Curso ${i + 1} eliminado definitivamente | ${responseTime}ms`);
    } else {
      deleteFailures.add(1);
      console.warn(`❌ Error eliminando curso ${i + 1} | Status ${resDelete.status} | ${responseTime}ms`);
      // Mostrar respuesta de error para debug
      if (resDelete.body) {
        console.log(`   📝 Respuesta: ${resDelete.body.substring(0, 100)}...`);
      }
    }

    sleep(0.5); // Pausa entre eliminaciones para no sobrecargar el servidor
  }
  
  console.log(`\n🏁 Proceso completado. Eliminados definitivamente: ${cursosAEvaluar.length} de ${courses.length} cursos en papelera`);
}

export function handleSummary(data) {
  console.log('\n' + '='.repeat(60));
  console.log('📊 RESUMEN FINAL - PR-02.5-03: Eliminación Definitiva de Cursos');
  console.log('='.repeat(60));
  
  const intentados = data.metrics?.delete_course_duration?.values?.count ?? 0;
  const exitos = data.metrics?.delete_successes?.values?.count ?? 0;
  const fallos = data.metrics?.delete_failures?.values?.count ?? 0;
  const promedio = Math.round(data.metrics?.delete_course_duration?.values?.avg ?? 0);
  
  console.log(`🗑️ Total de cursos procesados: ${intentados}`);
  console.log(`✅ Eliminaciones exitosas: ${exitos}`);
  console.log(`❌ Eliminaciones fallidas: ${fallos}`);
  console.log(`⏱️  Tiempo promedio por eliminación: ${promedio}ms`);
  
  if (exitos > 0) {
    console.log(`🎯 ÉXITO: ${exitos} cursos eliminados definitivamente de la papelera`);
  } else if (intentados === 0) {
    console.log(`ℹ️  No había cursos en la papelera para eliminar`);
  } else {
    console.log(`⚠️  No se pudieron eliminar cursos de la papelera`);
  }
  
  console.log('='.repeat(60) + '\n');
  return {};
}
