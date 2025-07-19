import http from 'k6/http';
import { check } from 'k6';
import { getHeadersWithCSRF } from '../login_token.js';

export const options = {
  vus: 1,
  iterations: 1,
};

// ⚠️ Reemplaza con tu ID real de curso
const COURSE_ID = 'PRUEBAID';

export default function () {
  const headers = getHeadersWithCSRF();

  // Paso 1: Obtener todas las sesiones
  const res = http.get(
    'https://teammates-orugas.appspot.com/webapi/sessions?entitytype=instructor&isinrecyclebin=false',
    { headers }
  );

  if (res.status !== 200) {
    console.error(`❌ Error al obtener sesiones: ${res.status}`);
    console.error(res.body);
    return;
  }

  const sesiones = JSON.parse(res.body);
  const sesionesDelCurso = sesiones.filter(s => s.courseId === COURSE_ID);

  console.log(`📦 Sesiones encontradas para el curso ${COURSE_ID}: ${sesionesDelCurso.length}`);

  for (const sesion of sesionesDelCurso) {
    const nombreSesion = encodeURIComponent(sesion.feedbackSessionName);

    const deleteUrl = `https://teammates-orugas.appspot.com/webapi/session?courseid=${COURSE_ID}&fsname=${nombreSesion}`;

    const delRes = http.del(deleteUrl, null, { headers });

    console.log(`🗑️ Eliminando sesión: ${sesion.feedbackSessionName}`);
    console.log(`📩 Status: ${delRes.status}`);
    console.log(`📬 Respuesta: ${delRes.body}`);

    check(delRes, {
      '✅ Sesión eliminada (200)': (r) => r.status === 200,
    });
  }

  if (sesionesDelCurso.length === 0) {
    console.log('⚠️ No hay sesiones para eliminar en este curso.');
  }
}
