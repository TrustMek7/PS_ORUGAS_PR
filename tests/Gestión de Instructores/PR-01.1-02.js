import http from 'k6/http';
import { check } from 'k6';
import { SharedArray } from 'k6/data';
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.1/index.js';

export const options = {
  vus: 3, // Número de usuarios virtuales
  iterations: 15, // Número total de iteraciones (debe ser múltiplo de vus para distribución equitativa)
};

// Función para leer y parsear el archivo de instructores
function parseInstructores() {
  try {
    const file = open('./instructores_validos_copy.txt');
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

export default function () {
  // Obtenemos el instructor correspondiente a la iteración actual
  const currentIndex = __ITER % instructores.length;
  const instructor = instructores[currentIndex];

  const url = 'https://teammates-orugas.appspot.com/webapi/account/request';
  const payload = JSON.stringify({
    instructorName: instructor.instructorName,
    instructorEmail: instructor.instructorEmail,
    instructorInstitution: instructor.instructorInstitution
  });

  const headers = {
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-TOKEN': '7DCD362E5DCD3752011B997D87F14420FB7BD1954727006FBB95C78E3AAF4D94',
      'Cookie': 'AUTH-TOKEN=8030BE84065C199AB5A665BE9359B9EB019C3DFE7A1EB544492E28ED50889EFB146235971B063DBCD422B4C78EFD2997A7F61906DB507879703E0D0D50E04080A67A206A1FFA585B8C2F1F1D76F0BC4740E81C0606B3998F774414B559F06D011D8C55309982B8DE01CD89564F97A8638C12881058BC6FCB38550115BA99FE43; JSESSIONID=node0ttfw0e6zq2h8171r1z9nleglo0.node0; CSRF-TOKEN=7DCD362E5DCD3752011B997D87F14420FB7BD1954727006FBB95C78E3AAF4D94',
    },
  };

  const res = http.post(url, payload, headers);

  console.log(`[VU ${__VU}] 📩 Status: ${res.status} | Email: ${instructor.instructorEmail}`);
  console.log(`[VU ${__VU}] 📬 Respuesta: ${res.body}`);

  check(res, {
    '✅ Solicitud exitosa (201 o 200)': (r) => r.status === 200 || r.status === 201,
    '✅ Respuesta contiene el email enviado': (r) => r.body && r.body.includes(instructor.instructorEmail),
  });
}

export function handleSummary(data) {
  return {
    'stdout': textSummary(data, { indent: ' ', enableColors: true }),
  };
}