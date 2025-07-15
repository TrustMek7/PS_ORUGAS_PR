import http from 'k6/http';
import { check } from 'k6';
import { SharedArray } from 'k6/data';
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.1/index.js';
import { getHeadersWithCSRF } from '../login_token.js';

export const options = {
  vus: 1,
  iterations: 5 //Número de instructores (Hasta 500)
};

// Función para leer el archivo y parsear los instructores
function parseInstructores() {
  try {
    const file = open('./instructores_sin_acentos.txt');
    const lines = file.split('\n');
    
    return lines.map(line => {
      if (!line.trim()) return null; // Saltar líneas vacías
      
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
    }).filter(instructor => instructor !== null); // Filtrar líneas inválidas
  } catch (error) {
    console.error('Error al leer el archivo:', error);
    throw error;
  }
}

// Cargar instructores desde el archivo
const instructores = new SharedArray('instructores', function() {
  return parseInstructores();
});

let index = 0;

export default function () {
  if (index >= instructores.length) {
    console.log('Todos los instructores han sido procesados');
    return;
  }

  const instructor = instructores[index++];

  const url = 'https://teammates-orugas.appspot.com/webapi/account/request';

  const payload = JSON.stringify(instructor);

  const headers = getHeadersWithCSRF();

  const res = http.post(url, payload, { headers });

  console.log(`📩 Status: ${res.status} | Email: ${instructor.instructorEmail}`);
  // No imprimimos el cuerpo completo para evitar salida muy larga

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