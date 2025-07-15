/**
 * Módulo para generar cookies de autenticación automáticamente
 * Importa este archivo en tus otros tests para obtener las cookies actuales
 */
import http from 'k6/http';
import { check } from 'k6';

// Tokens actuales - actualizar aquí cuando expiren
const TOKENS = {
  jsessionId: 'node01q3v7rfn6hu2b1kjbu2dvxb93u1.node0',
  csrfToken: '418026FDC65A295A1A5877A6601500B167BB9C1A9EA16B92C705372A0E05CF20C89A7046D807814E294A39DF1D149867',
  authToken: '40268EB965936E301D5963D9823A3EC74D8A03F2503A584B7FEFA8C51D725238146235971B063DBCD422B4C78EFD29976F0F3527494D1F85B783CA57B4561171EC4988B2881E611EA833467167CEBF5B7C26FBB416F2F45A943A59093E50B45A1D8C55309982B8DE01CD89564F97A863EFD15112D2297EE7326CED19C9D816CA'
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
    'X-CSRF-TOKEN': TOKENS.csrfToken,
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
