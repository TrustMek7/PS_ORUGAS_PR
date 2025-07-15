import http from 'k6/http';
import { check } from 'k6';
import { getHeadersWithCSRF } from '../login_token.js';

export const options = {
  vus: 1,
  iterations: 1,
  maxDuration: '10m',
};

export default function () {
  console.log('🔍 Obteniendo solicitudes pendientes...');
  
  // Paso 1: Obtener todas las solicitudes pendientes
  const getUrl = 'https://teammates-orugas.appspot.com/webapi/account/requests?status=PENDING';
  const getRes = http.get(getUrl, { headers: getHeadersWithCSRF() });

  check(getRes, {
    '✅ Obtener solicitudes - Status 200': (r) => r.status === 200,
    '✅ Obtener solicitudes - Tiempo ≤ 2s': (r) => r.timings.duration <= 2000,
  });

  if (getRes.status !== 200) {
    console.log('❌ Error al obtener solicitudes pendientes');
    return;
  }

  let solicitudes = [];
  try {
    solicitudes = (JSON.parse(getRes.body).accountRequests || []).slice(0, 300);
  } catch (e) {
    console.log('❌ Error al parsear respuesta JSON');
    return;
  }

  console.log(`📊 Solicitudes encontradas: ${solicitudes.length}`);
  if (solicitudes.length === 0) {
    console.log('⚠️ No hay solicitudes pendientes');
    return;
  }

  // Paso 2: Rechazar solicitudes masivamente sin razón
  const startTime = Date.now();
  let rechazosExitosos = 0, errores = 0;

  for (let i = 0; i < solicitudes.length; i++) {
    const solicitud = solicitudes[i];
    const solicitudId = solicitud.id || solicitud.accountRequestId || solicitud.requestId;

    if (!solicitudId) {
      errores++;
      continue;
    }

    const putUrl = `https://teammates-orugas.appspot.com/webapi/account/request?id=${solicitudId}`;
    const payload = JSON.stringify({
      status: 'REJECTED',
      rejectionReason: '',
      name: solicitud.name || solicitud.instructorName || 'Test Instructor',
      email: solicitud.email || solicitud.instructorEmail || 'test@example.com',
      institute: solicitud.institute || solicitud.institution || 'Test Institute'
    });

    const putRes = http.put(putUrl, payload, { headers: getHeadersWithCSRF() });
    
    if (putRes.status === 200 || putRes.status === 204) {
      rechazosExitosos++;
    } else {
      errores++;
      if (errores <= 3) console.log(`❌ Error solicitud ${i + 1}: Status ${putRes.status}`);
    }

    if ((i + 1) % 50 === 0 || (i + 1) === solicitudes.length) {
      console.log(`✅ Progreso: ${i + 1}/${solicitudes.length} solicitudes`);
    }
  }

  console.log(`🏁 Completado: ${rechazosExitosos} éxitos, ${errores} errores en ${((Date.now() - startTime) / 1000).toFixed(2)}s`);

  // Paso 3: Verificación final
  const verifyRes = http.get(getUrl, { headers: getHeadersWithCSRF() });
  const solicitudesRestantes = verifyRes.status === 200 ? 
    (JSON.parse(verifyRes.body).accountRequests?.length || 0) : 0;
  
  console.log(`📊 Solicitudes restantes: ${solicitudesRestantes}`);

  // Validaciones del test
  check({ rechazosExitosos, errores, solicitudes: solicitudes.length }, {
    '✅ Rechazos ejecutados': (d) => d.rechazosExitosos > 0,
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
  🎯 PR-04.1-03: ACCIÓN MASIVA - RECHAZAR SIN RAZÓN TODAS LAS SOLICITUDES
═══════════════════════════════════════════════════════════════════════════════
  📊 RESUMEN: ${stats.checksExitosos}/${stats.checksTotal} checks (${exitoTotal}%)
  🌐 HTTP: ${stats.requestsTotal} requests, ${stats.requestsFallidos}% fallidos, ${stats.duracionPromedio}ms promedio
  ⏱️ TIEMPO: ${stats.tiempoTotal}s total, ${stats.iteraciones} iteraciones
  🎯 OBJETIVO: Validar rechazo masivo sin motivos personalizados
═══════════════════════════════════════════════════════════════════════════════
`
  };
}
