import http from 'k6/http';
import { check } from 'k6';
import { getHeadersWithCSRF } from '../login_token.js';

export const options = {
  vus: 1,
  iterations: 1,
};

export default function () {
  const headers = getHeadersWithCSRF();

  const cursoObjetivo = 'TESTID'; // Cambiar por el ID de tu curso

  // 📥 Obtener sesiones visibles activas EN la papelera
  const getUrl = 'https://teammates-orugas.appspot.com/webapi/sessions?entitytype=instructor&isinrecyclebin=true';
  const res = http.get(getUrl, { headers });

  check(res, {
    '✅ Consulta de sesiones en papelera exitosa': r => r.status === 200,
  });

  const data = JSON.parse(res.body);
  const sesiones = data.feedbackSessions;

  // 📌 Filtrar sesiones del curso con permiso de modificación
  const sesionesFiltradas = sesiones.filter(s =>
    s.courseId === cursoObjetivo && s.privileges.canModifySession
  );

  for (const sesion of sesionesFiltradas) {
    const fsnameEncoded = encodeURIComponent(sesion.feedbackSessionName);
    const url = `https://teammates-orugas.appspot.com/webapi/bin/session?courseid=${cursoObjetivo}&fsname=${fsnameEncoded}`;

    console.log(`♻️ Restaurando sesión "${sesion.feedbackSessionName}" desde papelera`);
    console.log(`➡️ URL: ${url}`);

    const delRes = http.del(url, null, { headers });

    console.log(`📩 Status: ${delRes.status}`);
    console.log(`📬 Respuesta: ${delRes.body}`);

    check(delRes, {
      [`✅ Sesión "${sesion.feedbackSessionName}" restaurada (200 o 204)`]: r => r.status === 200 || r.status === 204,
    });
  }
}
