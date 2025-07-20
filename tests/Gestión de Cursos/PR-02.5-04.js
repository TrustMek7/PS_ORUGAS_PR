import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Counter } from 'k6/metrics';
import { getHeadersWithCSRF } from '../login_token.js';

const restoreDuration = new Trend('restore_course_duration');
const restoreFailures = new Counter('restore_failures');
const successfulRestores = new Counter('restore_successes');

export const options = {
  vus: 1,
  iterations: 1,
  thresholds: {
    'restore_course_duration': ['p(95)<3000'], // Acción ≤ 3s según el PR
    'http_req_failed': ['rate<0.05'],
  },
};

export default function () {
  // Buscar cursos en la papelera (soft deleted) para restaurar
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
    console.log('ℹ️  No hay cursos eliminados para restaurar');
    return;
  }

  // Limitar a máximo 100 cursos según el objetivo del PR
  const cursosARestaurar = courses.slice(0, Math.min(100, courses.length));
  console.log(`🔄 Restaurando ${cursosARestaurar.length} cursos eliminados...`);

  let restauradosExitosos = 0;
  let restauradosFallidos = 0;

  for (let i = 0; i < cursosARestaurar.length; i++) {
    const course = cursosARestaurar[i];
    const courseId = course.id || course.courseid || course.courseId;
    if (!courseId) {
      console.warn(`⚠️  Curso ${i + 1}: ID no encontrado`);
      restauradosFallidos++;
      continue;
    }

    console.log(`🔄 Restaurando curso ${i + 1}/${cursosARestaurar.length}: ${courseId}`);
    
    // Restaurar curso usando PUT en /webapi/bin/course con courseid como parámetro
    const restoreUrl = `https://teammates-orugas.appspot.com/webapi/bin/course?courseid=${encodeURIComponent(courseId)}`;
    
    const resRestore = http.put(restoreUrl, null, { headers: getHeadersWithCSRF() });
    const responseTime = resRestore.timings.duration;
    restoreDuration.add(responseTime);

    const success = check(resRestore, {
      '✅ PR-02.5-04: Status 200 OK': (r) => r.status === 200,
      '✅ PR-02.5-04: Acción ≤ 3s': (r) => r.timings.duration <= 3000,
    });

    if (success) {
      successfulRestores.add(1);
      restauradosExitosos++;
      console.log(`✅ Curso ${i + 1} restaurado exitosamente | ${responseTime}ms`);
      // Mostrar respuesta para debug de restauración exitosa
      if (resRestore.body) {
        console.log(`   📝 Respuesta: ${resRestore.body.substring(0, 150)}...`);
      }
    } else {
      restoreFailures.add(1);
      restauradosFallidos++;
      console.warn(`❌ Error restaurando curso ${i + 1} | Status ${resRestore.status} | ${responseTime}ms`);
      // Mostrar respuesta de error para debug
      if (resRestore.body) {
        console.log(`   📝 Respuesta: ${resRestore.body.substring(0, 100)}...`);
      }
    }

    sleep(0.2); // Pausa breve entre restauraciones para eficiencia masiva
  }
  
  // Verificar estado después de la restauración
  console.log(`\n🔍 Verificando estado después de la restauración...`);
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
    console.warn('⚠️  No se pudo verificar el estado post-restauración');
  }
  
  console.log(`\n🏁 Proceso de restauración completado:`);
  console.log(`   ✅ Cursos restaurados exitosamente: ${restauradosExitosos}`);
  console.log(`   ❌ Cursos que fallaron: ${restauradosFallidos}`);
  console.log(`   📊 Total procesados: ${cursosARestaurar.length} de ${courses.length} cursos eliminados`);
  console.log(`   🗑️ Cursos que quedan en papelera: ${remainingCourses.length}`);
  
  if (remainingCourses.length < courses.length) {
    console.log(`   ✅ CONFIRMADO: ${courses.length - remainingCourses.length} cursos movidos fuera de la papelera`);
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
  🎯 PR-02.5-04: ACCIÓN MASIVA - RESTAURAR TODOS LOS CURSOS ELIMINADOS
═══════════════════════════════════════════════════════════════════════════════
  � RESUMEN: ${stats.checksExitosos}/${stats.checksTotal} checks (${exitoTotal}%)
  🌐 HTTP: ${stats.requestsTotal} requests, ${stats.requestsFallidos}% fallidos, ${stats.duracionPromedio}ms promedio
  ⏱️ TIEMPO: ${stats.tiempoTotal}s total, ${stats.iteraciones} iteraciones
  🎯 OBJETIVO: Validar eficiencia de recuperación masiva de cursos
═══════════════════════════════════════════════════════════════════════════════
`
  };
}
