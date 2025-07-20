import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Counter } from 'k6/metrics';
import { getHeadersWithCSRF } from '../login_token.js';

// 📊 Métricas personalizadas
const duracionCargaNotificaciones = new Trend('notification_load_duration');
const contadorNotificaciones = new Counter('notifications_loaded');

export const options = {
  scenarios: {
    load_notifications: {
      executor: 'shared-iterations',
      vus: 10,
      iterations: 15,
      maxDuration: '5m',
    },
  },
  thresholds: {
    'notification_load_duration': ['avg<=2000'],
    'http_req_duration': ['avg<=2000'],
    'checks': ['rate>=0.95'],
  },
};

export default function () {
  console.log('🚀 PR-05.1-01: Cargar Lista de Notificaciones (>1000 registros)');
  
  const headers = getHeadersWithCSRF();
  const url = 'https://teammates-orugas.appspot.com/webapi/notifications';
  
  const inicioCarga = Date.now();
  const res = http.get(url, { headers });
  const duracion = Date.now() - inicioCarga;
  
  duracionCargaNotificaciones.add(duracion);

  let notificaciones = 0;
  let datosValidos = false;
  
  try {
    const data = JSON.parse(res.body);
    if (data.notifications && Array.isArray(data.notifications)) {
      notificaciones = data.notifications.length;
      datosValidos = true;
    } else if (Array.isArray(data)) {
      notificaciones = data.length;
      datosValidos = true;
    }
    
    if (notificaciones > 0) {
      contadorNotificaciones.add(notificaciones);
    }
  } catch (error) {
    console.log(`❌ Error al parsear respuesta: ${error.message}`);
  }

  console.log(`📊 Notificaciones encontradas: ${notificaciones} | ${duracion}ms`);

  check(res, {
    '✅ PR-05.1-01: Consulta de notificaciones exitosa': r => r.status === 200,
    '✅ PR-05.1-01: Tiempo de carga óptimo': r => duracion <= 2000,
    '✅ PR-05.1-01: Respuesta JSON válida': r => datosValidos,
    '✅ PR-05.1-01: Lista de notificaciones disponible': r => notificaciones > 0,
    '🎯 PR-05.1-01: OBJETIVO >1000 notificaciones': r => notificaciones > 1000,
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
  🎯 PR-05.1-01: VISUALIZACIÓN - CARGAR LISTA DE NOTIFICACIONES
═══════════════════════════════════════════════════════════════════════════════
  📊 RESUMEN: ${stats.checksExitosos}/${stats.checksTotal} checks (${exitoTotal}%)
  🌐 HTTP: ${stats.requestsTotal} requests, ${stats.requestsFallidos}% fallidos, ${stats.duracionPromedio}ms promedio
  ⏱️ TIEMPO: ${stats.tiempoTotal}s total, ${stats.iteraciones} iteraciones
  🎯 OBJETIVO: Validar rendimiento con gran volumen de registros (>1000)
═══════════════════════════════════════════════════════════════════════════════
`
  };
}
