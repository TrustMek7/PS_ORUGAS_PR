import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Counter } from 'k6/metrics';
import { getHeadersWithCSRF } from '../login_token.js';

// Métricas personalizadas
const deletedSessionLoadDuration = new Trend('deleted_session_load_duration');
const deletedSessionCount = new Trend('deleted_session_count');
const largeDeletedSessionList = new Counter('large_deleted_session_validations');

export const options = {
  vus: 10,
  iterations: 15,
  thresholds: {
    'deleted_session_load_duration': ['p(95)<2000'], // Tiempo de carga ≤ 2s
    'http_req_failed': ['rate<0.05'],
    'http_req_duration': ['p(95)<2000'],
    'deleted_session_count': ['avg>=0'],
  },
};

export default function () {
  const url = 'https://teammates-orugas.appspot.com/webapi/sessions?entitytype=instructor&isinrecyclebin=true';
  const res = http.get(url, { headers: getHeadersWithCSRF() });

  const responseTime = res.timings.duration;
  deletedSessionLoadDuration.add(responseTime);

  let sessionsLength = 0;
  try {
    const data = JSON.parse(res.body);
    if (Array.isArray(data)) {
      sessionsLength = data.length;
    } else if (data.feedbackSessions && Array.isArray(data.feedbackSessions)) {
      sessionsLength = data.feedbackSessions.length;
    } else if (data.sessions && Array.isArray(data.sessions)) {
      sessionsLength = data.sessions.length;
    } else if (data.length !== undefined) {
      sessionsLength = data.length;
    }
    deletedSessionCount.add(sessionsLength);
  } catch (_) {}

  check(res, {
    '✅ PR-04.2-02: Status 200 OK': (r) => r.status === 200,
    '✅ PR-04.2-02: Tiempo de carga ≤ 2s': (r) => r.timings.duration <= 2000,
    '✅ PR-04.2-02: JSON válido': (r) => {
      try {
        JSON.parse(r.body);
        return true;
      } catch (_) {
        return false;
      }
    },
    '✅ PR-04.2-02: Respuesta válida': (r) => {
      try {
        const json = JSON.parse(r.body);
        return Array.isArray(json) || 
               (json.feedbackSessions && Array.isArray(json.feedbackSessions)) ||
               (json.sessions && Array.isArray(json.sessions));
      } catch {
        return false;
      }
    },
    '✅ PR-04.2-02: Lista cargada completamente': (r) => {
      try {
        const json = JSON.parse(r.body);
        return !json.error && !json.partial;
      } catch {
        return false;
      }
    },
    '🎯 PR-04.2-02: IDEAL ≥ 500 sesiones eliminadas': (r) => {
      try {
        const json = JSON.parse(r.body);
        const count = json.feedbackSessions ? json.feedbackSessions.length : 
                     json.sessions ? json.sessions.length :
                     Array.isArray(json) ? json.length : 0;
        if (count >= 500) {
          largeDeletedSessionList.add(1);
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

export function handleSummary(data) {
  const stats = {
    checksTotal: data.metrics.checks?.values.count || 0,
    checksExitosos: data.metrics.checks?.values.passes || 0,
    requestsTotal: data.metrics.http_reqs?.values.count || 0,
    requestsFallidos: Math.round((data.metrics.http_req_failed?.values.rate || 0) * 100),
    duracionPromedio: Math.round(data.metrics.http_req_duration?.values.avg || 0),
    tiempoTotal: (data.metrics.iteration_duration?.values.avg / 1000).toFixed(2),
    iteraciones: data.metrics.iterations?.values.count || 0
  };
  
  const checksFallidos = stats.checksTotal - stats.checksExitosos;
  const exitoTotal = stats.checksTotal > 0 ? Math.round((stats.checksExitosos / stats.checksTotal) * 100) : 0;

  return {
    'stdout': `
═══════════════════════════════════════════════════════════════════════════════
  🎯 PR-04.2-02: VISUALIZACIÓN - CARGAR LISTA DE SESIONES DE FEEDBACK ELIMINADAS
═══════════════════════════════════════════════════════════════════════════════
  📊 RESUMEN: ${stats.checksExitosos}/${stats.checksTotal} checks (${exitoTotal}%)
  🌐 HTTP: ${stats.requestsTotal} requests, ${stats.requestsFallidos}% fallidos, ${stats.duracionPromedio}ms promedio
  ⏱️ TIEMPO: ${stats.tiempoTotal}s total, ${stats.iteraciones} iteraciones
  🎯 OBJETIVO: Validar rendimiento en vistas de datos históricos
═══════════════════════════════════════════════════════════════════════════════
`
  };
}
