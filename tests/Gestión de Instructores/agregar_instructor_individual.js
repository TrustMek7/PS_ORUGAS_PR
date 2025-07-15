import http from 'k6/http';
import { check } from 'k6';

export const options = {
  vus: 1,
  iterations: 5,
};

const instructores = [
  {
    instructorName: 'Teresa Salazar',
    instructorEmail: 'teresa.salazar+001@unsa.edu.pe',
    instructorInstitution: 'UNSA',
  },
  {
    instructorName: 'Miguel Vásquez',
    instructorEmail: 'miguel.vasquez+001@udep.edu.pe',
    instructorInstitution: 'UDEP',
  },
  {
    instructorName: 'Raúl Ramírez',
    instructorEmail: 'raul.ramirez+001@utec.edu.pe',
    instructorInstitution: 'UTEC',
  },
  {
    instructorName: 'José Mendoza',
    instructorEmail: 'jose.mendoza+001@ul.edu.pe',
    instructorInstitution: 'UL',
  },
  {
    instructorName: 'Carlos Cano',
    instructorEmail: 'carlos.cano+001@ul.edu.pe',
    instructorInstitution: 'UL',
  },
];

let index = 0;

export default function () {
  const instructor = instructores[index++];

  const url = 'https://teammates-orugas.appspot.com/webapi/account/request';

  const payload = JSON.stringify(instructor);

  const headers = {
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-TOKEN': '9969E8E5C82ECA0BC23D5B7F58FC69513A003EC83E7384F619B7C31A40FC3A2B', // ← usa tu token válido actual
      'Cookie': 'JSESSIONID=node05dakocntajd418teha6ew0np83.node0; CSRF-TOKEN=9969E8E5C82ECA0BC23D5B7F58FC69513A003EC83E7384F619B7C31A40FC3A2B; AUTH-TOKEN=8030BE84065C199AB5A665BE9359B9EB019C3DFE7A1EB544492E28ED50889EFB146235971B063DBCD422B4C78EFD2997A7F61906DB507879703E0D0D50E04080A67A206A1FFA585B8C2F1F1D76F0BC4740E81C0606B3998F774414B559F06D011D8C55309982B8DE01CD89564F97A8638C12881058BC6FCB38550115BA99FE43'
    },
  };

  const res = http.post(url, payload, headers);

  console.log(`📩 Status: ${res.status} | Email: ${instructor.instructorEmail}`);
  console.log(`📬 Respuesta: ${res.body}`);

  check(res, {
    '✅ Solicitud exitosa (201 o 200)': (r) => r.status === 201 || r.status === 200,
    '✅ Respuesta contiene el email enviado': (r) =>
      r.body && r.body.includes(instructor.instructorEmail),
  });
}
