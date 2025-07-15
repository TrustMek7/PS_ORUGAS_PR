import http from 'k6/http';
import { check } from 'k6';
import { SharedArray } from 'k6/data';

export const options = {
  vus: 1,
  iterations: 1,
};

const instructores = new SharedArray('instructores', function() {
  try {
    const contenido = open('./instructores_validos_copy.txt'); // Cambiado a nombre simple
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

  const headers = {
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-TOKEN': '7DCD362E5DCD3752011B997D87F14420FB7BD1954727006FBB95C78E3AAF4D94',
      'Cookie': 'AUTH-TOKEN=8030BE84065C199AB5A665BE9359B9EB019C3DFE7A1EB544492E28ED50889EFB146235971B063DBCD422B4C78EFD2997A7F61906DB507879703E0D0D50E04080A67A206A1FFA585B8C2F1F1D76F0BC4740E81C0606B3998F774414B559F06D011D8C55309982B8DE01CD89564F97A8638C12881058BC6FCB38550115BA99FE43; JSESSIONID=node0ttfw0e6zq2h8171r1z9nleglo0.node0; CSRF-TOKEN=7DCD362E5DCD3752011B997D87F14420FB7BD1954727006FBB95C78E3AAF4D94',
    },
  };

  const res = http.post('https://teammates-orugas.appspot.com/webapi/account/request', payload, headers);

  console.log(`📩 Status: ${res.status} | Email: ${instructor.correo}`);
  console.log(`📬 Respuesta: ${res.body}`);

  check(res, {
    '✅ Solicitud exitosa (201 o 200)': (r) => r.status === 200 || r.status === 201,
    '✅ Respuesta contiene el email enviado': (r) => r.body.includes(instructor.correo),
  });
}