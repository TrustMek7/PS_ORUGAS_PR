import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Counter } from 'k6/metrics';
import { getHeadersWithCSRF } from '../login_token.js';

const getNotificationsDuration = new Trend('get_notifications_duration');
const notificationsCount = new Trend('notifications_count');
const largeListValidation = new Counter('large_list_validations');

export const options = {
  vus: 10,
  iterations: 15,
  thresholds: {
    'get_notifications_duration': ['p(95)<5000'],
    'http_req_failed': ['rate<0.05'],
    'http_req_duration': ['p(95)<5000'],
    'notifications_count': ['avg>=0'],
  },
};

export default function () {
  const url = 'https://teammates-orugas.appspot.com/webapi/notifications';
  const res = http.get(url, { headers: getHeadersWithCSRF() });

  const responseTime = res.timings.duration;
  getNotificationsDuration.add(responseTime);

  let notificationsLength = 0;
  try {
    const data = JSON.parse(res.body);
    if (data.notifications && Array.isArray(data.notifications)) {
      notificationsLength = data.notifications.length;
    } else if (Array.isArray(data)) {
      notificationsLength = data.length;
    } else if (data.length !== undefined) {
      notificationsLength = data.length;
    }
    notificationsCount.add(notificationsLength);
  } catch (_) {}

  check(res, {
    '✅ PR-05.1-01: Status 200 OK': (r) => r.status === 200,
    '✅ PR-05.1-01: Tiempo de carga ≤ 2s': (r) => r.timings.duration <= 2000,
    '✅ PR-05.1-01: JSON válido': (r) => {
      try {
        JSON.parse(r.body);
        return true;
      } catch (_) {
        return false;
      }
    },
    '✅ PR-05.1-01: Respuesta válida': (r) => {
      try {
        const json = JSON.parse(r.body);
        return (json.notifications && Array.isArray(json.notifications)) || Array.isArray(json);
      } catch {
        return false;
      }
    },
    '✅ PR-05.1-01: Lista completa': (r) => {
      try {
        const json = JSON.parse(r.body);
        return !json.error && !json.partial && (json.notifications || Array.isArray(json));
      } catch {
        return false;
      }
    },
    '🎯 PR-05.1-01: IDEAL > 1000 notificaciones': (r) => {
      try {
        const json = JSON.parse(r.body);
        const count = json.notifications ? json.notifications.length : Array.isArray(json) ? json.length : 0;
        if (count > 1000) {
          largeListValidation.add(1);
          return true;
        }
        return false;
      } catch {
        return false;
      }
    }
  });

  sleep(0.5);
}

// Resumen al finalizar la prueba
export function handleSummary(data) {
  const avgNotifications = data.metrics.notifications_count?.values.avg || 0;
  const avgResponseTime = data.metrics.get_notifications_duration?.values.avg || 0;
  const successRate = data.metrics.checks?.values.rate ? (data.metrics.checks.values.rate * 100).toFixed(1) : '0';

  const resumen = [
    '\n' + '='.repeat(60),
    '📊 RESUMEN FINAL - PR-05.1-01: Carga de Notificaciones',
    '='.repeat(60),
    `📋 Promedio de notificaciones encontradas: ${Math.round(avgNotifications)}`,
    `⏱️  Tiempo promedio de respuesta: ${Math.round(avgResponseTime)}ms`,
    `✅ Tasa de éxito de validaciones: ${successRate}%`,
    avgNotifications > 1000
      ? '🎯 OBJETIVO CUMPLIDO: >1000 notificaciones ✅'
      : avgNotifications > 0
        ? `📈 ESTADO ACTUAL: ${Math.round(avgNotifications)} disponibles\n🎯 Faltan para llegar a >1000`
        : '⚠️  ADVERTENCIA: No se encontraron notificaciones',
    avgResponseTime <= 2000
      ? '⚡ RENDIMIENTO: Tiempo promedio ≤ 2s ✅'
      : `⚠️  RENDIMIENTO: Tiempo promedio > 2s (${Math.round(avgResponseTime)}ms)`,
    '='.repeat(60)
  ].join('\n');

  console.log(resumen);
  return {}; // No exporta archivo
}
