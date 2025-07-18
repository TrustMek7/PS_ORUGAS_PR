import http from 'k6/http';
import { check } from 'k6';
import { SharedArray } from 'k6/data';
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.1/index.js';
import { getHeadersWithCSRF } from '../login_token.js';  // Tu función para headers con CSRF

export const options = {
  vus: 1,
  iterations: 5 // Ajusta según la cantidad de notificaciones en el archivo
};

// Función para leer y parsear las notificaciones desde archivo
function parseNotificaciones() {
  try {
    const file = open('./notificaciones.txt');
    const lines = file.split('\n');

    return lines.map(line => {
      if (!line.trim()) return null; // saltar líneas vacías

      const parts = line.split('|').map(part => part.trim());

      if (parts.length !== 6) {
        console.warn(`Formato incorrecto en línea: ${line}`);
        return null;
      }

      return {
        title: parts[0],
        message: parts[1],
        style: parts[2],
        targetUser: parts[3],
        startTimestamp: Number(parts[4]),
        endTimestamp: Number(parts[5])
      };
    }).filter(noti => noti !== null);

  } catch (error) {
    console.error('Error al leer el archivo:', error);
    throw error;
  }
}

// Cargar notificaciones desde el archivo en memoria compartida
const notificaciones = new SharedArray('notificaciones', function() {
  return parseNotificaciones();
});

let index = 0;

export default function () {
  if (index >= notificaciones.length) {
    console.log('Todas las notificaciones han sido procesadas');
    return;
  }

  const noti = notificaciones[index++];

  const url = 'https://teammates-orugas.appspot.com/webapi/notification';

  const payload = JSON.stringify(noti);

  const headers = getHeadersWithCSRF();

  const res = http.post(url, payload, { headers });

  console.log(`📩 Status: ${res.status} | Title: ${noti.title}`);

  check(res, {
    '✅ Solicitud exitosa (201 o 200)': (r) => r.status === 201 || r.status === 200,
    '✅ Respuesta contiene el título enviado': (r) => r.body && r.body.includes(noti.title),
  });
}

export function handleSummary(data) {
  return {
    'stdout': textSummary(data, { indent: ' ', enableColors: true }),
  };
}
