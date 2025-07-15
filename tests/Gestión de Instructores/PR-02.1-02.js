import http from 'k6/http';
import { check } from 'k6';
import { SharedArray } from 'k6/data';
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.1/index.js';
import { getHeadersWithCSRF } from '../login_token.js';

export const options = {
  vus: 3, //Número de usuarios virtuales 
  iterations: 15, //Número de instructores en total (Hasta 500)
};

// Función para leer y parsear el archivo de instructores
function parseInstructores() {
  try {
    const file = open('./instructores_sin_acentos.txt');
    const lines = file.split('\n');
    
    return lines.map(line => {
      if (!line.trim()) return null;
      
      const parts = line.split('|').map(part => part.trim());
      if (parts.length !== 3) {
        console.warn(`Formato incorrecto en línea: ${line}`);
        return null;
      }
      
      return {
        instructorName: parts[0],
        instructorEmail: parts[1],
        instructorInstitution: parts[2]
      };
    }).filter(instructor => instructor !== null);
  } catch (error) {
    console.error('Error al leer el archivo:', error);
    throw error;
  }
}

// Cargamos los instructores una sola vez y los compartimos entre VUs
const instructores = new SharedArray('instructores', function() {
  return parseInstructores();
});

// Usamos un contador atómico para distribuir los instructores entre VUs
let instructorIndex = 0;

export default function () {
  // Obtenemos el siguiente instructor de manera segura para múltiples VUs
  const currentIndex = __ITER % instructores.length;
  const instructor = instructores[currentIndex];

  const url = 'https://teammates-orugas.appspot.com/webapi/account/request';
  const payload = JSON.stringify(instructor);

  const headers = getHeadersWithCSRF();

  const res = http.post(url, payload, { headers });

  console.log(`[VU ${__VU}] 📩 Status: ${res.status} | Email: ${instructor.instructorEmail}`);

  check(res, {
    '✅ Solicitud exitosa (201 o 200)': (r) => r.status === 201 || r.status === 200,
    '✅ Respuesta contiene el email enviado': (r) =>
      r.body && r.body.includes(instructor.instructorEmail),
  });
}

export function handleSummary(data) {
  return {
    'stdout': textSummary(data, { indent: ' ', enableColors: true }),
  };
}