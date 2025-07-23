/**
 * Módulo para generar cookies de autenticación automáticamente
 * Importa este archivo en tus otros tests para obtener las cookies actuales
 */
import http from 'k6/http';
import { check } from 'k6';

// Tokens actuales - actualizar aquí cuando expiren
const TOKENS = {
  jsessionId: 'node01vtycmqevvxxngb0ese9yy6ug0.node0',
  csrfToken: '0C86210956C325AEC24C5D36A285F83B7F49029A8B6202895D83A5D03C96937A',
  authToken: '40268EB965936E301D5963D9823A3EC74D8A03F2503A584B7FEFA8C51D725238146235971B063DBCD422B4C78EFD29976F0F3527494D1F85B783CA57B4561171EC4988B2881E611EA833467167CEBF5B7C26FBB416F2F45A943A59093E50B45A1D8C55309982B8DE01CD89564F97A86333C8CC62F70CFC0CEF0D7388D5984AEE',
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
    'X-CSRF-Token': TOKENS.csrfToken, 
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
