import http from 'k6/http';
import { check, sleep } from 'k6';
import { SharedArray } from 'k6/data';
import { getHeadersWithCSRF } from '../login_token.js';

export const options = {
  vus: 1,
  iterations: 5
};

// Cargar notificaciones desde archivo
const notificaciones = new SharedArray('notificaciones', function() {
  const file = open('./notificaciones.txt');
  const lines = file.split('\n');
  
  return lines.map(line => {
    if (!line.trim()) return null;
    const parts = line.split('|').map(part => part.trim());
    if (parts.length !== 6) return null;
    
    return {
      title: parts[0],
      message: parts[1],
      style: parts[2],
      targetUser: parts[3],
      startTimestamp: Number(parts[4]),
      endTimestamp: Number(parts[5])
    };
  }).filter(noti => noti !== null);
});

let index = 0;
let exitosas = 0;

export default function () {
  if (index >= notificaciones.length) return;

  const noti = notificaciones[index++];
  const url = 'https://teammates-orugas.appspot.com/webapi/notification';
  const payload = JSON.stringify(noti);
  const res = http.post(url, payload, { headers: getHeadersWithCSRF() });

  const resultado = check(res, {
    '✅ Solicitud exitosa (201 o 200)': (r) => r.status === 201 || r.status === 200,
    '✅ Respuesta contiene el título enviado': (r) => r.body && r.body.includes(noti.title),
  });

  if (resultado) {
    exitosas++;
  }

  sleep(0.5); // pequeño delay para evitar saturar el servidor
}

// Mostrar resultado total una vez terminado el test
export function handleSummary(data) {
  console.log(`\n🔔 Total de notificaciones verificadas exitosamente: ${exitosas} de ${notificaciones.length}\n`);
  return {};
}
