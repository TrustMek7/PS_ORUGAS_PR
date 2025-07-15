import http from 'k6/http';
import { check } from 'k6';
import { SharedArray } from 'k6/data';
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.1/index.js';

export const options = {
  vus: 3, //Número de usuarios virtuales 
  iterations: 15, //Número de instructores en total (Hasta 500)
};

// Función para leer y parsear el archivo de instructores
function parseInstructores() {
  try {
    const file = open('./instructores_validos.txt');
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

  const headers = {
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-TOKEN': '9969E8E5C82ECA0BC23D5B7F58FC69513A003EC83E7384F619B7C31A40FC3A2B',
      'Cookie': 'JSESSIONID=node05dakocntajd418teha6ew0np83.node0; CSRF-TOKEN=9969E8E5C82ECA0BC23D5B7F58FC69513A003EC83E7384F619B7C31A40FC3A2B; AUTH-TOKEN=8030BE84065C199AB5A665BE9359B9EB019C3DFE7A1EB544492E28ED50889EFB146235971B063DBCD422B4C78EFD2997A7F61906DB507879703E0D0D50E04080A67A206A1FFA585B8C2F1F1D76F0BC4740E81C0606B3998F774414B559F06D011D8C55309982B8DE01CD89564F97A8638C12881058BC6FCB38550115BA99FE43'
    },
  };

  const res = http.post(url, payload, headers);

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