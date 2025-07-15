import http from 'k6/http';
import { check } from 'k6';
import { getHeadersWithCSRF } from '../login_token.js';

export const options = {
  vus: 1,
  iterations: 1,
  maxDuration: '10m',
};

// Mensajes personalizados para rechazos
const mensajesRechazo = [
  'Su solicitud no cumple con los requisitos académicos mínimos establecidos.',
  'La información proporcionada es incompleta o incorrecta.',
  'El instituto especificado no está en nuestra lista de instituciones aprobadas.',
  'Su perfil académico no coincide con los criterios de selección.',
  'Documentación faltante o no válida para procesar su solicitud.',
  'El correo electrónico proporcionado no pertenece al dominio institucional.',
  'Su solicitud fue duplicada, ya existe un registro previo.',
  'Los datos de contacto proporcionados no son válidos.',
  'No se pudo verificar su afiliación institucional.',
  'Su solicitud no incluye la información requerida para instructores.'
];

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

  // Paso 2: Rechazar solicitudes con razones personalizadas
  const startTime = Date.now();
  let rechazosExitosos = 0, errores = 0;
  let tiemposEnvioCorreo = [];

  for (let i = 0; i < solicitudes.length; i++) {
    const solicitud = solicitudes[i];
    const solicitudId = solicitud.id || solicitud.accountRequestId || solicitud.requestId;

    if (!solicitudId) {
      errores++;
      continue;
    }

    // Seleccionar mensaje personalizado de forma rotativa
    const mensajePersonalizado = mensajesRechazo[i % mensajesRechazo.length];
    
    const putUrl = `https://teammates-orugas.appspot.com/webapi/account/request?id=${solicitudId}`;
    const payload = JSON.stringify({
      status: 'REJECTED',
      rejectionReason: mensajePersonalizado,
      name: solicitud.name || solicitud.instructorName || 'Test Instructor',
      email: solicitud.email || solicitud.instructorEmail || 'test@example.com',
      institute: solicitud.institute || solicitud.institution || 'Test Institute'
    });

    const requestStart = Date.now();
    const putRes = http.put(putUrl, payload, { headers: getHeadersWithCSRF() });
    const requestTime = Date.now() - requestStart;
    
    if (putRes.status === 200 || putRes.status === 204) {
      rechazosExitosos++;
      tiemposEnvioCorreo.push(requestTime);
      
      // Validar tiempo de envío de correo ≤ 1s
      check({ tiempoCorreo: requestTime }, {
        '✅ Envío correo ≤ 1s': (d) => d.tiempoCorreo <= 1000,
      });
    } else {
      errores++;
      if (errores <= 3) console.log(`❌ Error solicitud ${i + 1}: Status ${putRes.status}`);
    }

    if ((i + 1) % 50 === 0 || (i + 1) === solicitudes.length) {
      console.log(`✅ Progreso: ${i + 1}/${solicitudes.length} solicitudes con razón personalizada`);
    }
  }

  const tiempoPromedio = tiemposEnvioCorreo.length > 0 ? 
    tiemposEnvioCorreo.reduce((a, b) => a + b, 0) / tiemposEnvioCorreo.length : 0;

  console.log(`🏁 Completado: ${rechazosExitosos} éxitos, ${errores} errores en ${((Date.now() - startTime) / 1000).toFixed(2)}s`);
  console.log(`📧 Tiempo promedio envío correos: ${tiempoPromedio.toFixed(2)}ms`);

  // Paso 3: Verificación final
  const verifyRes = http.get(getUrl, { headers: getHeadersWithCSRF() });
  const solicitudesRestantes = verifyRes.status === 200 ? 
    (JSON.parse(verifyRes.body).accountRequests?.length || 0) : 0;
  
  console.log(`📊 Solicitudes restantes: ${solicitudesRestantes}`);

  // Validaciones del test
  check({ rechazosExitosos, errores, solicitudes: solicitudes.length, tiempoPromedio }, {
    '✅ Rechazos con razón ejecutados': (d) => d.rechazosExitosos > 0,
    '✅ Sin errores críticos': (d) => (d.errores / d.solicitudes) < 0.1,
    '✅ Proceso completado': (d) => (d.rechazosExitosos + d.errores) === d.solicitudes,
    '✅ Correos enviados eficientemente': (d) => d.tiempoPromedio <= 1000,
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
  
  const exitoTotal = stats.checksTotal > 0 ? Math.round((stats.checksExitosos / stats.checksTotal) * 100) : 0;

  return {
    'stdout': `
═══════════════════════════════════════════════════════════════════════════════
  🎯 PR-04.1-02: ACCIÓN MASIVA - RECHAZAR CON RAZÓN TODAS LAS SOLICITUDES
═══════════════════════════════════════════════════════════════════════════════
  📊 RESUMEN: ${stats.checksExitosos}/${stats.checksTotal} checks (${exitoTotal}%)
  🌐 HTTP: ${stats.requestsTotal} requests, ${stats.requestsFallidos}% fallidos, ${stats.duracionPromedio}ms promedio
  ⏱️ TIEMPO: ${stats.tiempoTotal}s total, ${stats.iteraciones} iteraciones
  📧 OBJETIVO: Evaluar sistema de notificaciones y envío de correos personalizados
═══════════════════════════════════════════════════════════════════════════════
`
  };
}
