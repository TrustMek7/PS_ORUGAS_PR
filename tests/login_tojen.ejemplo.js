/**
 * EJEMPLO de archivo de tokens para autenticación
 * Copia este archivo como `login_token.js` y reemplaza los valores con tus tokens reales.
 * Este archivo NO debe subirse a Git.
 */

import http from 'k6/http';
import { check } from 'k6';

// Tokens de ejemplo (reemplazar con reales en login_token.js)
const TOKENS = {
  jsessionId: 'REEMPLAZAR_JSESSIONID',
  csrfToken: 'REEMPLAZAR_CSRF_TOKEN',
  authToken: 'REEMPLAZAR_AUTH_TOKEN',
};

export function getCookies() {
  return `JSESSIONID=${TOKENS.jsessionId}; CSRF-TOKEN=${TOKENS.csrfToken}; AUTH-TOKEN=${TOKENS.authToken}`;
}

export function getHeaders() {
  return {
    'Content-Type': 'application/json',
    'Cookie': getCookies(),
  };
}

export function getHeadersWithCSRF() {
  return {
    'Content-Type': 'application/json',
    'X-CSRF-Token': TOKENS.csrfToken,
    'Cookie': getCookies(),
  };
}
