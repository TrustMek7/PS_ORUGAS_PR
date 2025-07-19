import http from 'k6/http';
import { check } from 'k6';
import { SharedArray } from 'k6/data';
import { getHeadersWithCSRF } from '../login_token.js';

export const options = {
  vus: 1,
  iterations: 3,
};

// ⚠️ Reemplaza con tu ID real del curso
const COURSE_ID = 'PRUEBAID';

// 📥 Cargar sesiones desde archivo
const sesiones = new SharedArray('sesiones', function () {
  try {
    const contenido = open('./sesiones.txt');
    return contenido
      .split('\n')
      .map(linea => linea.trim())
      .filter(linea => linea.length > 0 && linea.includes('|'))
      .map(linea => {
        const partes = linea.split('|').map(p => p.trim());
        return {
          feedbackSessionName: partes[0],
          instructions: partes[1],
          submissionStartTimestamp: Number(partes[2]),
          submissionEndTimestamp: Number(partes[3]),
          gracePeriod: Number(partes[4]),
        };
      });
  } catch (error) {
    throw new Error(`Error al leer archivo de sesiones: ${error}`);
  }
});

export default function () {
  const sesion = sesiones[__ITER % sesiones.length];

  const payload = JSON.stringify({
    ...sesion,
    sessionVisibleSetting: "AT_OPEN",
    customSessionVisibleTimestamp: 0,
    responseVisibleSetting: "LATER",
    customResponseVisibleTimestamp: 0,
    isClosingSoonEmailEnabled: true,
    isPublishedEmailEnabled: true,
  });

  const headers = getHeadersWithCSRF();

  const res = http.post(`https://teammates-orugas.appspot.com/webapi/session?courseid=${COURSE_ID}`, payload, {
    headers
  });

  console.log(`🛠️ Creando sesión: ${sesion.feedbackSessionName}`);
  console.log(`📩 Status: ${res.status}`);
  console.log(`📬 Respuesta: ${res.body}`);

  check(res, {
    '✅ Solicitud exitosa (201 o 200)': r => r.status === 200 || r.status === 201,
    '✅ Nombre de la sesión en la respuesta': r => r.body.includes(sesion.feedbackSessionName),
  });
}
