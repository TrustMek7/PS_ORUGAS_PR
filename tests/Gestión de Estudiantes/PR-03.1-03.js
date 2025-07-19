import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Counter } from 'k6/metrics';
import { getHeadersWithCSRF } from '../login_token.js';

const deleteStudentDuration = new Trend('delete_student_duration');
const totalDeleteDuration = new Trend('total_delete_duration');
const studentsDeleted = new Counter('students_deleted');
const failedDeletes = new Counter('failed_deletes');

export const options = {
  vus: 1,
  iterations: 1,
  thresholds: {
    'http_req_failed': ['rate<0.05'],
    'total_delete_duration': ['p(95)<5000'], // Más realista: ≤ 5s para acción masiva
    'delete_student_duration': ['p(95)<2000'], // ≤ 2s por estudiante individual
  },
};

export default function () {
  console.log('🚀 Iniciando PR-03.1-03: Eliminar Múltiples Estudiantes');
  
  // Primero obtenemos los cursos disponibles
  const courseUrl = 'https://teammates-orugas.appspot.com/webapi/courses?entitytype=instructor&coursestatus=active';
  const courseRes = http.get(courseUrl, { headers: getHeadersWithCSRF() });

  check(courseRes, {
    '✅ PR-03.1-03: Cursos - Status 200 OK': (r) => r.status === 200,
  });

  let courses = [];
  try {
    const data = JSON.parse(courseRes.body);
    courses = Array.isArray(data.courses) ? data.courses : data;
  } catch (e) {
    console.log('❌ Error parseando cursos:', e.message);
    return;
  }

  console.log(`📚 Cursos encontrados: ${courses.length}`);
  
  // Buscamos un curso que tenga estudiantes
  let targetCourse = null;
  let targetStudents = [];
  
  for (let course of courses) {
    const courseId = course.id || course.courseid || course.courseId;
    if (!courseId) continue;

    const studentsUrl = `https://teammates-orugas.appspot.com/webapi/students?courseid=${courseId}`;
    const studentsRes = http.get(studentsUrl, { headers: getHeadersWithCSRF() });
    
    if (studentsRes.status === 200) {
      try {
        const responseData = JSON.parse(studentsRes.body);
        if (responseData.students && Array.isArray(responseData.students) && responseData.students.length > 0) {
          targetCourse = courseId;
          targetStudents = responseData.students;
          console.log(`🎯 Curso seleccionado: ${courseId} con ${targetStudents.length} estudiantes`);
          break;
        }
      } catch (e) {
        console.log(`❌ Error parseando estudiantes del curso ${courseId}:`, e.message);
      }
    }
    sleep(0.1);
  }

  if (!targetCourse || targetStudents.length === 0) {
    console.log('❌ No se encontró ningún curso con estudiantes para eliminar');
    return;
  }

  // Determinar cuántos estudiantes eliminar (máximo 100 o todos los disponibles)
  const studentsToDelete = Math.min(100, targetStudents.length);
  const studentsToProcess = targetStudents.slice(0, studentsToDelete);
  
  console.log(`🗑️  Iniciando eliminación de ${studentsToProcess.length} estudiantes del curso ${targetCourse}`);
  
  // Medir el tiempo total de eliminación
  const startTime = Date.now();
  let deletedCount = 0;
  let failedCount = 0;

  // Eliminar estudiantes de forma secuencial para simular acción masiva controlada
  for (let i = 0; i < studentsToProcess.length; i++) {
    const student = studentsToProcess[i];
    const studentEmail = student.email;
    
    if (!studentEmail) {
      console.log(`⚠️  Estudiante ${i + 1} sin email, saltando...`);
      continue;
    }

    const deleteUrl = `https://teammates-orugas.appspot.com/webapi/student?courseid=${targetCourse}&studentemail=${encodeURIComponent(studentEmail)}`;
    
    const deleteStartTime = Date.now();
    const deleteRes = http.del(deleteUrl, null, { headers: getHeadersWithCSRF() });
    const deleteTime = Date.now() - deleteStartTime;
    
    deleteStudentDuration.add(deleteTime);

    const success = check(deleteRes, {
      '✅ PR-03.1-03: Delete Status OK': (r) => r.status === 200 || r.status === 204,
      '✅ PR-03.1-03: Delete Time ≤ 1s': (r) => deleteTime <= 1000,
    });

    // Un status 200 o 204 indica eliminación exitosa
    if (deleteRes.status === 200 || deleteRes.status === 204) {
      deletedCount++;
      studentsDeleted.add(1);
      console.log(`✅ Estudiante ${i + 1}/${studentsToProcess.length} eliminado: ${studentEmail} | ${deleteTime}ms`);
    } else {
      failedCount++;
      failedDeletes.add(1);
      console.log(`❌ Error eliminando estudiante ${i + 1}/${studentsToProcess.length}: ${studentEmail} | Status: ${deleteRes.status} | ${deleteTime}ms`);
    }

    // Pequeña pausa para no sobrecargar el servidor (reducida para mejorar tiempo total)
    sleep(0.02);
  }

  const totalTime = Date.now() - startTime;
  totalDeleteDuration.add(totalTime);

  console.log('\n' + '='.repeat(70));
  console.log('📊 RESUMEN DE ELIMINACIÓN MASIVA');
  console.log('='.repeat(70));
  console.log(`🎯 Curso procesado: ${targetCourse}`);
  console.log(`🗑️  Estudiantes a eliminar: ${studentsToProcess.length}`);
  console.log(`✅ Eliminados exitosamente: ${deletedCount}`);
  console.log(`❌ Fallos: ${failedCount}`);
  console.log(`⏱️  Tiempo total: ${totalTime}ms`);
  console.log(`📈 Tasa de éxito: ${((deletedCount / studentsToProcess.length) * 100).toFixed(1)}%`);
  console.log('='.repeat(70));

  // Validación final: verificar que el curso ya no tiene (o tiene menos) estudiantes
  console.log('\n🔍 Validando eliminación...');
  const finalStudentsRes = http.get(`https://teammates-orugas.appspot.com/webapi/students?courseid=${targetCourse}`, 
                                   { headers: getHeadersWithCSRF() });
  
  if (finalStudentsRes.status === 200) {
    try {
      const finalData = JSON.parse(finalStudentsRes.body);
      const remainingStudents = finalData.students ? finalData.students.length : 0;
      console.log(`📊 Estudiantes restantes en el curso: ${remainingStudents}`);
      
      check(finalStudentsRes, {
        '✅ PR-03.1-03: Validación final - Estudiantes eliminados': () => 
          remainingStudents < targetStudents.length,
        '✅ PR-03.1-03: Tiempo total ≤ 5s': () => totalTime <= 5000,
        '✅ PR-03.1-03: Tasa de éxito ≥ 80%': () => 
          (deletedCount / studentsToProcess.length) >= 0.8,
      });
    } catch (e) {
      console.log('❌ Error validando eliminación final:', e.message);
    }
  }
}

export function teardown(data) {
  console.log('\n' + '='.repeat(60));
  console.log('📊 RESUMEN FINAL - PR-03.1-03: Eliminación Masiva de Estudiantes');
  console.log('='.repeat(60));
  
  if (data && data.metrics) {
    console.log(`🗑️  Total de estudiantes eliminados: ${data.metrics.students_deleted?.values?.count || 0}`);
    console.log(`❌ Total de fallos: ${data.metrics.failed_deletes?.values?.count || 0}`);
    console.log(`⏱️  Tiempo promedio por eliminación: ${Math.round(data.metrics.delete_student_duration?.values?.avg || 0)}ms`);
    console.log(`🕐 Tiempo total promedio: ${Math.round(data.metrics.total_delete_duration?.values?.avg || 0)}ms`);
  } else {
    console.log('⚠️  Datos de métricas no disponibles en teardown');
  }
  
  console.log('='.repeat(60) + '\n');
}
