import http from 'k6/http';
import { check } from 'k6';
import { getHeadersWithCSRF } from '../login_token.js';

// Configuración para acción masiva de aprobación
export const options = {
  iterations: 300,
  vus: 1,
  thresholds: {
    http_req_duration: ['p(95)<3000'], // 95% de las requests deben completarse en <3s
    http_req_failed: ['rate<0.05'], // Menos del 5% de requests pueden fallar
  },
  tags: {
    modulo: 'Gestión de Instructores',
  },
};

// Variables para el resumen final
const startTime = Date.now();

// Headers de autenticación desde login_token.js
const headers = getHeadersWithCSRF();

// Cache para solicitudes pendientes completas (con todos los datos)
let pendingRequests = [];
let currentIndex = 0;

export function setup() {
  // Obtener lista de solicitudes pendientes al inicio con todos los datos
  const response = http.get('https://teammates-orugas.appspot.com/webapi/account/requests?status=PENDING', {
    headers: headers
  });
  
  if (response.status === 200) {
    try {
      const data = JSON.parse(response.body);
      pendingRequests = data.accountRequests?.slice(0, 300) || [];
      console.log(`🔍 Solicitudes pendientes encontradas para aprobar: ${pendingRequests.length}`);
      if (pendingRequests.length > 0) {
        console.log(`📝 Ejemplo de solicitud: ${pendingRequests[0].name} (${pendingRequests[0].email})`);
      }
    } catch (e) {
      console.warn(`⚠️ Error al obtener solicitudes pendientes: ${e.message}`);
    }
  }
  
  return { pendingRequests };
}

export default function (data) {
  if (!data.pendingRequests || data.pendingRequests.length === 0) {
    console.warn('❌ No hay solicitudes pendientes para aprobar');
    return;
  }
  
  // Usar índice rotativo para diferentes solicitudes
  const request = data.pendingRequests[currentIndex % data.pendingRequests.length];
  currentIndex++;
  
  if (!request || !request.id) {
    console.warn('❌ Solicitud no válida');
    return;
  }
  
  // Realizar acción de aprobación mediante PUT
  const approvalUrl = `https://teammates-orugas.appspot.com/webapi/account/request?id=${request.id}`;
  
  // Payload completo con todos los datos necesarios para aprobación
  const approvalPayload = JSON.stringify({
    id: request.id,
    email: request.email,
    name: request.name,
    institute: request.institute,
    registrationKey: request.registrationKey,
    requestId: request.requestId,
    status: 'APPROVED'
  });
  
  const response = http.put(approvalUrl, approvalPayload, {
    headers: {
      ...headers,
      'Content-Type': 'application/json'
    },
    tags: { name: 'aprobar_solicitud_masiva' }
  });
  
  if (response.status === 200 || response.status === 204) {
    console.log(`✅ Solicitud aprobada | ${request.name} (${request.email}) | Status: ${response.status} | Tiempo: ${response.timings.duration}ms`);
  } else if (response.status === 404) {
    console.log(`⚠️ Solicitud no encontrada | ${request.name} | Status: ${response.status} | Tiempo: ${response.timings.duration}ms`);
  } else {
    console.log(`❌ Error en aprobación | ${request.name} | Status: ${response.status} | Tiempo: ${response.timings.duration}ms`);
  }
  
  // Verificar si excede el umbral de tiempo
  if (response.timings.duration > 3000) {
    console.warn(`⚠️ ALERTA: Tiempo de aprobación ${response.timings.duration}ms excede umbral de 3000ms`);
  }
  
  // Validaciones de rendimiento con check para métricas
  const exitoso = check(response, {
    '✅ Status éxito (200/204)': (r) => r.status === 200 || r.status === 204,
    '✅ Respuesta válida': (r) => r.status !== 0,
    '✅ Tiempo respuesta ≤ 3s': (r) => r.timings.duration <= 3000,
    '✅ Operación completada': (r) => r.status !== 500,
  });

  if (!exitoso) {
    console.warn(`❌ Error en aprobación masiva | ${request.name} | Status: ${response.status} | Tiempo: ${response.timings.duration}ms`);
  }
}

export function handleSummary(data) {
  const totalDuracion = Date.now() - startTime;
  const iteraciones = data.metrics.iterations.values.count || 0;
  const exitosos = data.metrics.checks.values.passes || 0;
  const fallidos = data.metrics.checks.values.fails || 0;
  const totalChecks = exitosos + fallidos;
  const promedio = Math.round(data.metrics.http_req_duration?.values?.avg || 0);
  const httpExitosos = data.metrics.http_reqs?.values?.count - (data.metrics.http_req_failed?.values?.count || 0);

  console.log('\n' + '═'.repeat(79));
  console.log('  📘 PR-01.4-01: ACCIÓN MASIVA - APROBAR SOLICITUDES');
  console.log('═'.repeat(79));
  console.log(`  🧪 APROBACIONES REALIZADAS: ${iteraciones}`);
  console.log(`  ✅ VALIDACIONES EXITOSAS: ${exitosos} de ${totalChecks} (${totalChecks > 0 ? ((exitosos / totalChecks) * 100).toFixed(1) : '0.0'}%)`);
  console.log(`  ❌ VALIDACIONES FALLIDAS: ${fallidos}`);
  console.log(`  📬 REQUESTS HTTP EXITOSOS: ${httpExitosos || 0} de ${data.metrics.http_reqs?.values?.count || 0}`);
  console.log(`  ⏱️  TIEMPO PROMEDIO DE APROBACIÓN: ${promedio}ms`);
  console.log(`  ⌛ TIEMPO TOTAL: ${Math.round(totalDuracion / 1000)}s`);
  console.log(`  🎯 OBJETIVO: Aprobar masivamente 300 instructores pendientes`);

  if (fallidos === 0 && promedio <= 3000) {
    console.log(`  ✅ VALIDACIÓN: Dentro del umbral de tiempo de acción aceptable`);
  } else {
    console.log(`  ⚠️ VALIDACIÓN: Tiempo de acción excede el umbral de 3s`);
  }

  console.log(`  📋 NOTA: Prueba de eficiencia backend para operaciones masivas`);
  console.log('═'.repeat(79) + '\n');

  return {};
}
