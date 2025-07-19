import http from 'k6/http';
import { check } from 'k6';
import { getHeadersWithCSRF } from '../login_token.js';

export const options = {
  vus: 1,
  iterations: 1,
};

export default function () {
  console.log('📚 Obteniendo cursos...');

  const cursosUrl = 'https://teammates-orugas.appspot.com/webapi/courses?entitytype=instructor&coursestatus=active';
  const resCursos = http.get(cursosUrl, { headers: getHeadersWithCSRF() });

  check(resCursos, {
    '✅ Cursos obtenidos - Status 200': (r) => r.status === 200,
  });

  if (resCursos.status !== 200) {
    console.log('❌ No se pudieron obtener los cursos');
    return;
  }

  let cursos = [];
  try {
    cursos = JSON.parse(resCursos.body).courses || [];
  } catch (e) {
    console.log('❌ Error al parsear cursos');
    return;
  }

  if (cursos.length === 0) {
    console.log('⚠️ No hay cursos activos');
    return;
  }

  console.log(`📦 Cursos encontrados: ${cursos.length}`);

  let totalSesiones = 0;
  for (const curso of cursos) {
    const courseId = curso.id || curso.courseId;

    if (!courseId) continue;

    const sesionesUrl = `https://teammates-orugas.appspot.com/webapi/sessions?courseid=${encodeURIComponent(courseId)}`;
    const resSesiones = http.get(sesionesUrl, { headers: getHeadersWithCSRF() });

    if (resSesiones.status !== 200) {
      console.log(`⚠️ No se pudieron obtener sesiones para el curso: ${courseId}`);
      continue;
    }

    let sesiones = [];
    try {
      sesiones = JSON.parse(resSesiones.body).feedbackSessions || [];
    } catch (e) {
      console.log(`❌ Error al parsear sesiones de curso: ${courseId}`);
      continue;
    }

    for (const sesion of sesiones) {
      const fsName = sesion.feedbackSessionName || sesion.name;
      if (!fsName) continue;

      const statsUrl = `https://teammates-orugas.appspot.com/webapi/session/stats?courseid=${encodeURIComponent(courseId)}&fsname=${encodeURIComponent(fsName)}`;
      const resStats = http.get(statsUrl, { headers: getHeadersWithCSRF() });

      if (resStats.status === 200) {
        const stats = JSON.parse(resStats.body);
        console.log(`📊 Curso: ${courseId}`);
        console.log(`🧾 Sesión: ${fsName}`);
        console.log(`📈 Response rate: ${stats.responseRate || 'N/A'}\n`);
        totalSesiones++;
      } else {
        console.log(`⚠️ Error obteniendo stats de sesión: ${fsName} del curso: ${courseId}`);
      }
    }
  }

  if (totalSesiones === 0) {
    console.log('⚠️ No se encontraron sesiones de feedback con estadísticas.');
  } else {
    console.log(`✅ Total sesiones con stats consultadas: ${totalSesiones}`);
  }
}
