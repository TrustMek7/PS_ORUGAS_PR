import http from 'k6/http';
import { check } from 'k6';
import { getHeadersWithCSRF } from '../login_token.js';

export const options = {
  vus: 1,
  iterations: 1,
  maxDuration: '10m',
  thresholds: {
    'http_req_duration': ['p(95)<3000'], // Acción masiva ≤ 3s (95%)
    'checks': ['rate>0.95']
  }
};

let pendingRequests = [];

export function setup() {
  console.log('🔧 Configurando datos para el test...');
  
  const getUrl = 'https://teammates-orugas.appspot.com/webapi/account/requests?status=PENDING';
  const getRes = http.get(getUrl, { headers: getHeadersWithCSRF() });

  if (getRes.status === 200) {
    try {
      const data = JSON.parse(getRes.body);
      pendingRequests = (data.accountRequests || []).slice(0, 300);
      console.log(`📊 Solicitudes pendientes encontradas: ${pendingRequests.length}`);
      return { requests: pendingRequests };
    } catch (e) {
      console.log('❌ Error al parsear datos de setup');
      return { requests: [] };
    }
  }
  
  console.log('❌ Error en setup - no se pudieron obtener solicitudes');
  return { requests: [] };
}
export default function (data) {
  const solicitudes = data?.requests || [];
  
  if (solicitudes.length === 0) {
    console.log('⚠️ No hay solicitudes pendientes para rechazar');
    return;
  }

  console.log(`🎯 Iniciando rechazo masivo de ${solicitudes.length} solicitudes sin razón...`);
  
  const startTime = Date.now();
  let rechazosExitosos = 0, errores = 0;

  // Rechazar solicitudes usando PUT sin payload de razón
  for (let i = 0; i < solicitudes.length; i++) {
    const solicitud = solicitudes[i];
    const solicitudId = solicitud.id || solicitud.accountRequestId || solicitud.requestId;

    if (!solicitudId) {
      errores++;
      continue;
    }

    // Usar PUT tal como especifica el requisito
    const putUrl = `https://teammates-orugas.appspot.com/webapi/account/request?id=${solicitudId}`;
    const payload = JSON.stringify({
      id: solicitudId,
      email: solicitud.email,
      name: solicitud.name,
      institute: solicitud.institute,
      registrationKey: solicitud.registrationKey,
      requestId: solicitudId,
      status: "REJECTED"
      // Sin campo "rejectionReason" para rechazar sin motivo
    });

    const putRes = http.put(putUrl, payload, { headers: getHeadersWithCSRF() });

    check(putRes, {
      '✅ Rechazo sin razón - Status 200': (r) => r.status === 200,
      '✅ Rechazo sin razón - Tiempo ≤ 2s': (r) => r.timings.duration <= 2000,
    });

    if (putRes.status === 200) {
      rechazosExitosos++;
    } else {
      errores++;
      if (errores <= 3) console.log(`❌ Error solicitud ${i + 1}: Status ${putRes.status}`);
    }

    if ((i + 1) % 50 === 0 || (i + 1) === solicitudes.length) {
      console.log(`📈 Progreso: ${i + 1}/${solicitudes.length} solicitudes procesadas`);
    }
  }

  const tiempoTotal = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`🏁 Rechazo masivo completado: ${rechazosExitosos} éxitos, ${errores} errores en ${tiempoTotal}s`);

  // Validaciones finales
  check({ rechazosExitosos, errores, solicitudes: solicitudes.length, tiempoTotal: parseFloat(tiempoTotal) }, {
    '✅ Rechazos sin razón ejecutados': (d) => d.rechazosExitosos > 0,
    '✅ Tiempo total ≤ 2s': (d) => d.tiempoTotal <= 2,
    '✅ Sin errores críticos': (d) => (d.errores / d.solicitudes) < 0.1,
    '✅ Proceso completado': (d) => (d.rechazosExitosos + d.errores) === d.solicitudes,
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
  🎯 PR-01.4-03: ACCIÓN MASIVA - RECHAZAR SIN RAZÓN TODAS LAS SOLICITUDES
═══════════════════════════════════════════════════════════════════════════════
  📊 RESUMEN: ${stats.checksExitosos}/${stats.checksTotal} checks (${exitoTotal}%)
  🌐 HTTP: ${stats.requestsTotal} requests, ${stats.requestsFallidos}% fallidos, ${stats.duracionPromedio}ms promedio
  ⏱️ TIEMPO: ${stats.tiempoTotal}s total, ${stats.iteraciones} iteraciones
  🎯 OBJETIVO: Validar rechazo masivo sin motivos personalizados
═══════════════════════════════════════════════════════════════════════════════
`
  };
}
