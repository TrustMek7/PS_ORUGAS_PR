/**
 * Módulo para generar cookies de autenticación automáticamente
 * Importa este archivo en tus otros tests para obtener las cookies actuales
 */
import http from 'k6/http';
import { check } from 'k6';

// Tokens actuales - actualizar aquí cuando expiren
const TOKENS = {
  jsessionId: 'node01mag2s32r1s491bvs4lqfwy29f0.node0',
  csrfToken: '2736178BFB6EC290C13581A5EE90D38C5BCF9F91A251CE67197BB5FFC11BB010C89A7046D807814E294A39DF1D149867',
  authToken: '8030BE84065C199AB5A665BE9359B9EB019C3DFE7A1EB544492E28ED50889EFB146235971B063DBCD422B4C78EFD2997A7F61906DB507879703E0D0D50E04080A67A206A1FFA585B8C2F1F1D76F0BC4740E81C0606B3998F774414B559F06D011D8C55309982B8DE01CD89564F97A863811C1F3E168831E31A6FF924D9F7BA22',
};

/**
 * Función para generar las cookies automáticamente
 * @returns {string} String completa de cookies lista para usar
 */
export function getCookies() {
  return `JSESSIONID=${TOKENS.jsessionId}; CSRF-TOKEN=${TOKENS.csrfToken}; AUTH-TOKEN=${TOKENS.authToken}`;
}

/**
 * Función para obtener headers completos con cookies
 * @returns {Object} Headers object listo para requests HTTP
 */
export function getHeaders() {
  return {
    'Content-Type': 'application/json',
    'Cookie': getCookies(),
  };
}

/**
 * Función para obtener headers con CSRF token separado (para POST requests)
 * @returns {Object} Headers object con X-CSRF-TOKEN separado
 */
export function getHeadersWithCSRF() {
  return {
    'Content-Type': 'application/json',
    'X-CSRF-Token': TOKENS.csrfToken, // ✅ corrección aquí
    'Cookie': getCookies(),
  };
}

export const options = {
  vus: 1,
  duration: '10s',
};

export default function () {
  const url = 'https://teammates-orugas.appspot.com/web/instructor/home';
  const res = http.get(url, { headers: getHeaders() });

  check(res, {
    'Página cargada con éxito (status 200)': (r) => r.status === 200,
  });
}
