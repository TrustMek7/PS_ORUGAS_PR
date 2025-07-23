import http from 'k6/http';
import { check } from 'k6';
import { getHeadersWithCSRF } from '../login_token.js';

// Configuración para visualización de requests pendientes
export const options = {
  iterations: 10,
  vus: 1,
  thresholds: {
    http_req_duration: ['p(95)<2000'], // 95% de las requests deben completarse en <2s
    http_req_failed: ['rate<0.1'], // Menos del 10% de requests pueden fallar
  },
  tags: {
    modulo: 'Gestión de Instructores',
  },
};

// Variables para el resumen final
const startTime = Date.now();

// Headers de autenticación desde login_token.js
const headers = getHeadersWithCSRF();

export default function () {
  // Usar el endpoint de API correcto que mencionaste
  const endpointUrl = 'https://teammates-orugas.appspot.com/webapi/account/requests?status=PENDING';
  
  const response = http.get(endpointUrl, {
    headers: headers,
    tags: { name: 'visualizar_pending_requests' }
  });
  
  let requestCount = 0;
  
  if (response.status === 200) {
    try {
      // Intentar parsear como JSON (API endpoint)
      const data = JSON.parse(response.body);
      requestCount = data.accountRequests ? data.accountRequests.length : 0;
      
      if (requestCount >= 100) {
        console.log(`✅ Carga exitosa | Status: ${response.status} | Tiempo: ${response.timings.duration}ms | Requests pendientes: ${requestCount}`);
      } else if (requestCount > 0) {
        console.log(`⚠️ Carga parcial | Status: ${response.status} | Tiempo: ${response.timings.duration}ms | Requests pendientes: ${requestCount}`);
      } else {
        console.log(`❌ Vista sin datos | Status: ${response.status} | Tiempo: ${response.timings.duration}ms | Sin requests pendientes`);
      }
      
      // Verificamos si excede el umbral de tiempo de carga
      if (response.timings.duration > 2000) {
        console.warn(`⚠️ ALERTA: Tiempo de carga ${response.timings.duration}ms excede umbral de 2000ms`);
      }
    } catch (e) {
      // Si no es JSON, manejar como HTML (fallback)
      const bodySize = response.body.length;
      console.log(`⚠️ Respuesta HTML | Status: ${response.status} | Tiempo: ${response.timings.duration}ms | Tamaño: ${Math.round(bodySize/1024)}KB`);
    }
  } else {
    console.log(`❌ Error en carga | Status: ${response.status} | Tiempo: ${response.timings.duration}ms`);
  }
  
  // Validaciones de rendimiento con check para métricas
  const exitoso = check(response, {
    '✅ Status 200': (r) => r.status === 200,
    '✅ Respuesta contiene contenido': (r) => r.body && r.body.length > 0,
    '✅ Tiempo respuesta ≤ 2s': (r) => r.timings.duration <= 2000,
    '✅ Datos JSON válidos': (r) => {
      try {
        const data = JSON.parse(r.body);
        return data && typeof data === 'object';
      } catch {
        return false;
      }
    }
  });

  if (!exitoso) {
    console.warn(`❌ Error en carga de vista | Status: ${response.status} | Tiempo: ${response.timings.duration}ms`);
  }
}

export function handleSummary(data) {
  const totalDuracion = Date.now() - startTime;
  const iteraciones = data.metrics.iterations.values.count || 0;
  const exitosos = data.metrics.checks.values.passes || 0;
  const fallidos = data.metrics.checks.values.fails || 0;
  const totalChecks = exitosos + fallidos;
  const promedio = Math.round(data.metrics.http_req_duration?.values?.avg || 0);

  console.log('\n' + '═'.repeat(79));
  console.log('  📘 PR-01.3-01: VISUALIZACIÓN PENDING ACCOUNT REQUESTS');
  console.log('═'.repeat(79));
  console.log(`  🧪 SOLICITUDES REALIZADAS: ${iteraciones}`);
  console.log(`  ✅ VALIDACIONES EXITOSAS: ${exitosos} de ${totalChecks} (${totalChecks > 0 ? ((exitosos / totalChecks) * 100).toFixed(1) : '0.0'}%)`);
  console.log(`  ❌ VALIDACIONES FALLIDAS: ${fallidos}`);
  console.log(`  ⏱️  TIEMPO PROMEDIO DE CARGA: ${promedio}ms`);
  console.log(`  ⌛ TIEMPO TOTAL: ${Math.round(totalDuracion / 1000)}s`);
  console.log(`  🎯 OBJETIVO: Cargar vista con 400+ instructores pendientes`);

  if (fallidos === 0 && promedio <= 2000) {
    console.log(`  ✅ VALIDACIÓN: Dentro del umbral de tiempo de carga aceptable`);
  } else {
    console.log(`  ⚠️ VALIDACIÓN: Tiempo de carga excede el umbral de 2s`);
  }

  console.log(`  📋 NOTA: Prueba de eficiencia API para carga de datos masivos`);
  console.log('═'.repeat(79) + '\n');

  return {};
}
