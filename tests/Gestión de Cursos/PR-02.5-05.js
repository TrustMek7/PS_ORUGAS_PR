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
    'delete_course_duration': ['p(95)<3000'], // Acción ≤ 3s según el PR
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
    console.error('❌ Error parseando cursos eliminados:', e.message);
    console.log(`📝 Response: ${res.body.substring(0, 200)}...`);
    return;
  }

  console.log(`🗑️ Cursos eliminados encontrados: ${courses.length}`);
  
  if (courses.length === 0) {
    console.log('ℹ️  No hay cursos eliminados para eliminar definitivamente');
    return;
  }

  // Procesar hasta 1000 cursos según el objetivo del PR
  const cursosAEliminar = courses.slice(0, Math.min(1000, courses.length));
  console.log(`🔥 Eliminando definitivamente ${cursosAEliminar.length} cursos...`);

  let eliminadosExitosos = 0;
  let eliminadosFallidos = 0;

  for (let i = 0; i < cursosAEliminar.length; i++) {
    const course = cursosAEliminar[i];
    const courseId = course.id || course.courseid || course.courseId;
    if (!courseId) {
      console.warn(`⚠️  Curso ${i + 1}: ID no encontrado`);
      eliminadosFallidos++;
      continue;
    }

    console.log(`🔥 Eliminando definitivamente curso ${i + 1}/${cursosAEliminar.length}: ${courseId}`);
    
    // Eliminar curso definitivamente usando DELETE en /webapi/course según el PR
    const deleteUrl = `https://teammates-orugas.appspot.com/webapi/course?courseid=${encodeURIComponent(courseId)}`;
    
    const resDelete = http.del(deleteUrl, null, { headers: getHeadersWithCSRF() });
    const responseTime = resDelete.timings.duration;
    deleteDuration.add(responseTime);

    const success = check(resDelete, {
      '✅ PR-02.5-05: Status 200 OK': (r) => r.status === 200,
      '✅ PR-02.5-05: Acción ≤ 3s': (r) => r.timings.duration <= 3000,
    });

    if (success) {
      successfulDeletes.add(1);
      eliminadosExitosos++;
      console.log(`✅ Curso ${i + 1} eliminado definitivamente | ${responseTime}ms`);
      // Mostrar respuesta para debug de eliminación exitosa
      if (resDelete.body) {
        console.log(`   📝 Respuesta: ${resDelete.body.substring(0, 100)}...`);
      }
    } else {
      deleteFailures.add(1);
      eliminadosFallidos++;
      console.warn(`❌ Error eliminando curso ${i + 1} | Status ${resDelete.status} | ${responseTime}ms`);
      // Mostrar respuesta de error para debug
      if (resDelete.body) {
        console.log(`   📝 Respuesta: ${resDelete.body.substring(0, 100)}...`);
      }
    }

    sleep(0.1); // Pausa muy breve entre eliminaciones para eficiencia masiva
  }
  
  // Verificar estado después de la eliminación definitiva
  console.log(`\n🔍 Verificando estado después de la eliminación definitiva...`);
  sleep(1); // Esperar un momento para que se procesen los cambios
  
  const verifyRes = http.get(deletedCoursesUrl, { headers: getHeadersWithCSRF() });
  let remainingCourses = [];
  try {
    const verifyData = JSON.parse(verifyRes.body);
    if (Array.isArray(verifyData)) {
      remainingCourses = verifyData;
    } else if (Array.isArray(verifyData.courses)) {
      remainingCourses = verifyData.courses;
    }
  } catch (e) {
    console.warn('⚠️  No se pudo verificar el estado post-eliminación');
  }
  
  console.log(`\n🏁 Proceso de eliminación definitiva completado:`);
  console.log(`   ✅ Cursos eliminados definitivamente: ${eliminadosExitosos}`);
  console.log(`   ❌ Cursos que fallaron: ${eliminadosFallidos}`);
  console.log(`   📊 Total procesados: ${cursosAEliminar.length} de ${courses.length} cursos eliminados`);
  console.log(`   🗑️ Cursos que quedan en papelera: ${remainingCourses.length}`);
  
  if (remainingCourses.length < courses.length) {
    console.log(`   ✅ CONFIRMADO: ${courses.length - remainingCourses.length} cursos eliminados permanentemente`);
  } else {
    console.log(`   ⚠️  Los cursos siguen apareciendo en la papelera - verificar estado`);
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
  🎯 PR-02.5-05: ACCIÓN MASIVA - ELIMINAR DEFINITIVAMENTE TODOS LOS CURSOS
═══════════════════════════════════════════════════════════════════════════════
  � RESUMEN: ${stats.checksExitosos}/${stats.checksTotal} checks (${exitoTotal}%)
  🌐 HTTP: ${stats.requestsTotal} requests, ${stats.requestsFallidos}% fallidos, ${stats.duracionPromedio}ms promedio
  ⏱️ TIEMPO: ${stats.tiempoTotal}s total, ${stats.iteraciones} iteraciones
  🎯 OBJETIVO: Confirmar eliminación sin errores ni inconsistencias
  🚨 ADVERTENCIA: Los cursos eliminados NO se pueden recuperar
═══════════════════════════════════════════════════════════════════════════════
`
  };
}
