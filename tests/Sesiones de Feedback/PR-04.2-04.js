import http from 'k6/http';
import { check } from 'k6';
import { getHeadersWithCSRF } from '../login_token.js';

export const options = {
  vus: 1,
  iterations: 1,
};

export default function () {
  const headers = getHeadersWithCSRF();

  // 📥 Obtener sesiones visibles activas en papelera
  const getUrl = 'https://teammates-orugas.appspot.com/webapi/sessions?entitytype=instructor&isinrecyclebin=true';
  const res = http.get(getUrl, { headers });

  check(res, {
    '✅ Consulta de sesiones exitosa': r => r.status === 200,
  });

  const data = JSON.parse(res.body);
  const sesiones = data.feedbackSessions;

  const cursoObjetivo = 'TESTID';

  // 🧹 Filtrar sesiones del curso con permiso de borrado
  const sesionesFiltradas = sesiones.filter(s =>
    s.courseId === cursoObjetivo && s.privileges.canModifySession
  );

  for (const sesion of sesionesFiltradas) {
    const fsnameEncoded = encodeURIComponent(sesion.feedbackSessionName);
    const url = `https://teammates-orugas.appspot.com/webapi/session?courseid=${cursoObjetivo}&fsname=${fsnameEncoded}`;

    console.log(`➡️ Intentando eliminar sesión "${sesion.feedbackSessionName}"`);
    console.log(`➡️ URL: ${url}`);

    const delRes = http.del(url, null, { headers });

    console.log(`📩 Status: ${delRes.status}`);
    console.log(`📬 Respuesta: ${delRes.body}`);

    check(delRes, {
      [`✅ Sesión "${sesion.feedbackSessionName}" eliminada (200 o 204)`]: r => r.status === 200 || r.status === 204,
    });
  }
}
