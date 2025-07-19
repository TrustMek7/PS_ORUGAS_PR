import http from 'k6/http';
import { check } from 'k6';
import { getHeadersWithCSRF } from '../login_token.js';

export default function () {
  const headers = getHeadersWithCSRF();  // Aquí obtienes los headers con auth

  const urlGetSessions = 'https://teammates-orugas.appspot.com/webapi/sessions?entitytype=instructor&isinrecyclebin=false';
  const resGet = http.get(urlGetSessions, { headers });

  console.log(`Status GET sesiones: ${resGet.status}`);
  console.log(`Body GET sesiones: ${resGet.body.substring(0, 300)}`);

  check(resGet, {
    'GET sesiones status 200': (r) => r.status === 200,
  });

  if (resGet.status !== 200) {
    console.error('Error obteniendo sesiones');
    return;
  }

  const sesiones = resGet.json();
  // Filtrar sesiones y hacer PUT para eliminarlas, usando también headers

  const courseId = '473H-YW35';
  const sesionesCurso = sesiones.filter(s => s.courseid === courseId);

  for (const sesion of sesionesCurso) {
    const fsname = encodeURIComponent(sesion.fsname);
    const urlDelete = `https://teammates-orugas.appspot.com/webapi/bin/session?courseid=${courseId}&fsname=${fsname}`;
    const resDelete = http.put(urlDelete, null, { headers });

    if (resDelete.status === 200) {
      console.log(`Sesión ${fsname} eliminada correctamente.`);
    } else {
      console.error(`Error eliminando sesión ${fsname}: status ${resDelete.status}`);
    }
  }
}
