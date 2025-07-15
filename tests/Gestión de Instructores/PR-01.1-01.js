import http from 'k6/http';
import { check } from 'k6';
import { SharedArray } from 'k6/data';
import { getHeadersWithCSRF } from '../login_token.js';

export const options = {
  vus: 1,
  iterations: 1,
};

const instructores = new SharedArray('instructores', function() {
  try {
    const contenido = open('./instructores_sin_acentos.txt'); // Cambiado a nombre simple
    return contenido.split('\n')
      .map(linea => linea.trim())
      .filter(linea => linea.length > 0 && linea.includes('|'))
      .map(linea => {
        const partes = linea.split('|').map(parte => parte.trim());
        return {
          nombre: partes[0],
          correo: partes[1],
          institucion: partes[2]
        };
      });
  } catch (error) {
    throw new Error(`Error al leer archivo: ${error}`);
  }
});

export default function () {
  const instructor = instructores[__ITER % instructores.length];
  
  const payload = JSON.stringify({
    instructorName: instructor.nombre,
    instructorEmail: instructor.correo,
    instructorInstitution: instructor.institucion,
  });

  const headers = getHeadersWithCSRF();

  const res = http.post('https://teammates-orugas.appspot.com/webapi/account/request', payload, { headers });

  console.log(`📩 Status: ${res.status} | Email: ${instructor.correo}`);
  console.log(`📬 Respuesta: ${res.body}`);

  check(res, {
    '✅ Solicitud exitosa (201 o 200)': (r) => r.status === 200 || r.status === 201,
    '✅ Respuesta contiene el email enviado': (r) => r.body.includes(instructor.correo),
  });
}