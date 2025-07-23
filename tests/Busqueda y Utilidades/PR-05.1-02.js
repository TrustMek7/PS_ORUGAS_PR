import http from 'k6/http';
import { check } from 'k6';
import { SharedArray } from 'k6/data';
import { Trend, Counter } from 'k6/metrics';
import { getHeadersWithCSRF } from '../login_token.js';

// 📊 Métricas personalizadas
const duracionCreacionNotificacion = new Trend('notification_creation_duration');
const contadorNotificacionesCreadas = new Counter('notifications_created');

export const options = {
  scenarios: {
    create_notifications: {
      executor: 'shared-iterations',
      vus: 1,
      iterations: 100,
      maxDuration: '10m',
    },
  },
  thresholds: {
    'notification_creation_duration': ['avg<=5000'],
    'http_req_duration': ['avg<=5000'],
    'checks': ['rate>=0.95'],
  },
  tags: {
  modulo: 'Busqueda y Utilidades',
},
};

// 📥 Cargar notificaciones desde archivo
const notificaciones = new SharedArray('notificaciones', function () {
  try {
    const contenido = open('./notificaciones.txt');
    return contenido
      .split('\n')
      .map(linea => linea.trim())
      .filter(linea => linea.length > 0 && linea.includes('|'))
      .map(linea => {
        const partes = linea.split('|').map(p => p.trim());
        return {
          title: partes[0],
          message: partes[1],
          style: partes[2],
          targetUser: partes[3],
          startTimestamp: Number(partes[4]),
          endTimestamp: Number(partes[5]),
        };
      });
  } catch (error) {
    throw new Error(`Error al leer archivo de notificaciones: ${error}`);
  }
});

export default function () {
  if (__ITER === 0) {
    console.log('🚀 PR-05.1-02: Creación Masiva de Notificaciones (100 individuales)');
  }
  
  const noti = notificaciones[__ITER % notificaciones.length];
  const headers = getHeadersWithCSRF();
  
  const inicioCreacion = Date.now();
  const payload = JSON.stringify(noti);
  const res = http.post('https://teammates-orugas.appspot.com/webapi/notification', payload, { headers });
  const duracion = Date.now() - inicioCreacion;
  
  duracionCreacionNotificacion.add(duracion);
  
  const exitoso = res.status === 201 || res.status === 200;
  if (exitoso) {
    contadorNotificacionesCreadas.add(1);
    console.log(`✅ Notificación ${__ITER + 1}/100: "${noti.title}" creada | ${duracion}ms`);
  } else {
    console.log(`❌ Error ${__ITER + 1}/100: "${noti.title}" - Status: ${res.status}`);
  }

  check(res, {
    '✅ PR-05.1-02: Notificación creada exitosamente': r => exitoso,
    '✅ PR-05.1-02: Tiempo de creación aceptable': r => duracion <= 5000,
    '✅ PR-05.1-02: Respuesta contiene datos de la notificación': r => r.body && r.body.includes(noti.title),
  });
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
  🎯 PR-05.1-02: CARGA - CREACIÓN MASIVA DE NOTIFICACIONES
═══════════════════════════════════════════════════════════════════════════════
  📊 RESUMEN: ${stats.checksExitosos}/${stats.checksTotal} checks (${exitoTotal}%)
  🌐 HTTP: ${stats.requestsTotal} requests, ${stats.requestsFallidos}% fallidos, ${stats.duracionPromedio}ms promedio
  ⏱️ TIEMPO: ${stats.tiempoTotal}s total, ${stats.iteraciones} iteraciones
  🎯 OBJETIVO: Evaluar estabilidad del sistema en carga secuencial (100 notificaciones)
═══════════════════════════════════════════════════════════════════════════════
`
  };
}
