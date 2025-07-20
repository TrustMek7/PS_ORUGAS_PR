import http from 'k6/http';
import { check } from 'k6';
import { SharedArray } from 'k6/data';
import { getHeadersWithCSRF } from '../login_token.js';

export const options = {
  vus: 1,
  iterations: 100, // debe coincidir con la cantidad de notificaciones si quieres ver 500 checks
};

// 📥 Cargar notificaciones desde archivo
const notificaciones = new SharedArray('notificaciones', function () {
  try {
    const contenido = open('./notificaciones.txt');
    return contenido
      .split('\n')
      .map(linea => linea.trim())
      .filter(linea => linea.length > 0 && linea.includes('|'))
      .map(linea => {
        const partes = linea.split('|').map(p => p.trim());
        return {
          title: partes[0],
          message: partes[1],
          style: partes[2],
          targetUser: partes[3],
          startTimestamp: Number(partes[4]),
          endTimestamp: Number(partes[5]),
        };
      });
  } catch (error) {
    throw new Error(`Error al leer archivo de notificaciones: ${error}`);
  }
});

export default function () {
  const noti = notificaciones[__ITER % notificaciones.length];

  const payload = JSON.stringify(noti);
  const headers = getHeadersWithCSRF();

  const res = http.post(`https://teammates-orugas.appspot.com/webapi/notification`, payload, {
    headers,
  });

  console.log(`🔔 Enviando notificación: ${noti.title}`);
  console.log(`📩 Status: ${res.status}`);
  console.log(`📬 Respuesta: ${res.body}`);

  check(res, {
    '✅ Solicitud exitosa (201 o 200)': r => r.status === 201 || r.status === 200,
    '✅ Respuesta contiene el título enviado': r => r.body && r.body.includes(noti.title),
  });
}
