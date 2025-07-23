import http from 'k6/http';
import { check } from 'k6';
import { getHeadersWithCSRF } from '../login_token.js';

// Configuración para acción masiva de rechazo con razón personalizada
export const options = {
  iterations: 300,
  vus: 1,
  thresholds: {
    http_req_duration: ['p(95)<1000'], // 95% de las requests deben completarse en <1s (envío de correo)
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

// Mensajes de rechazo personalizados (cargados desde mensajes_rechazo.txt)
const mensajesRechazo = [
  'Su solicitud no cumple con los requisitos académicos mínimos establecidos por la institución.',
  'La información proporcionada en su aplicación es incompleta o contiene datos incorrectos.',
  'El instituto especificado no está en nuestra lista de instituciones académicas aprobadas.',
  'Su perfil académico y experiencia no coinciden con los criterios de selección requeridos.',
  'Documentación faltante o no válida para procesar adecuadamente su solicitud de registro.',
  'El correo electrónico proporcionado no pertenece al dominio institucional correspondiente.',
  'Su solicitud fue identificada como duplicada, ya existe un registro previo en el sistema.',
  'Los datos de contacto proporcionados no pudieron ser verificados o no son válidos.',
  'No fue posible confirmar su afiliación institucional con la información suministrada.',
  'Su solicitud no incluye toda la información académica requerida para instructores.',
  'Las credenciales académicas presentadas no cumplen con los estándares mínimos exigidos.',
  'El área de especialización indicada no coincide con las necesidades actuales del programa.',
  'Su experiencia docente reportada es insuficiente para los requisitos del cargo.',
  'La institución de procedencia no tiene convenios vigentes con nuestra plataforma educativa.',
  'Los documentos de identificación proporcionados no son legibles o están incompletos.',
  'Su solicitud no incluye las certificaciones profesionales requeridas para la enseñanza.',
  'El formato de la solicitud no cumple con las especificaciones técnicas establecidas.',
  'La información de contacto alternativo proporcionada no pudo ser verificada exitosamente.',
  'Su perfil no presenta evidencia suficiente de competencias digitales para enseñanza virtual.',
  'La solicitud fue presentada fuera del período de registro establecido por la institución.'
];

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
      console.log(`🔍 Solicitudes pendientes encontradas para rechazar: ${pendingRequests.length}`);
      console.log(`📝 Mensajes de rechazo disponibles: ${mensajesRechazo.length}`);
      if (pendingRequests.length > 0) {
        console.log(`📋 Ejemplo de solicitud: ${pendingRequests[0].name} (${pendingRequests[0].email})`);
      }
    } catch (e) {
      console.warn(`⚠️ Error al obtener solicitudes pendientes: ${e.message}`);
    }
  }
  
  return { pendingRequests, mensajesRechazo };
}

export default function (data) {
  if (!data.pendingRequests || data.pendingRequests.length === 0) {
    console.warn('❌ No hay solicitudes pendientes para rechazar');
    return;
  }
  
  // Usar índice rotativo para diferentes solicitudes
  const request = data.pendingRequests[currentIndex % data.pendingRequests.length];
  const mensajePersonalizado = mensajesRechazo[currentIndex % mensajesRechazo.length];
  currentIndex++;
  
  if (!request || !request.id) {
    console.warn('❌ Solicitud no válida');
    return;
  }
  
  // Realizar acción de rechazo mediante PUT con mensaje personalizado
  const rejectionUrl = `https://teammates-orugas.appspot.com/webapi/account/request?id=${request.id}`;
  
  // Payload completo con todos los datos necesarios para rechazo
  const rejectionPayload = JSON.stringify({
    id: request.id,
    email: request.email,
    name: request.name,
    institute: request.institute,
    registrationKey: request.registrationKey,
    requestId: request.requestId,
    status: 'REJECTED',
    rejectionReason: mensajePersonalizado
  });
  
  const response = http.put(rejectionUrl, rejectionPayload, {
    headers: {
      ...headers,
      'Content-Type': 'application/json'
    },
    tags: { name: 'rechazar_solicitud_masiva_con_razon' }
  });
  
  if (response.status === 200 || response.status === 204) {
    console.log(`✅ Solicitud rechazada | ${request.name} (${request.email}) | Razón: "${mensajePersonalizado.substring(0, 50)}..." | Status: ${response.status} | Tiempo: ${response.timings.duration}ms`);
  } else if (response.status === 404) {
    console.log(`⚠️ Solicitud no encontrada | ${request.name} | Status: ${response.status} | Tiempo: ${response.timings.duration}ms`);
  } else {
    console.log(`❌ Error en rechazo | ${request.name} | Status: ${response.status} | Tiempo: ${response.timings.duration}ms`);
  }
  
  // Verificar si excede el umbral de tiempo de envío de correo
  if (response.timings.duration > 1000) {
    console.warn(`⚠️ ALERTA: Tiempo de envío de correo ${response.timings.duration}ms excede umbral de 1000ms`);
  }
  
  // Validaciones de rendimiento con check para métricas
  const exitoso = check(response, {
    '✅ Status éxito (200/204)': (r) => r.status === 200 || r.status === 204,
    '✅ Respuesta válida': (r) => r.status !== 0,
    '✅ Envío correo ≤ 1s': (r) => r.timings.duration <= 1000,
    '✅ Operación completada': (r) => r.status !== 500,
  });

  if (!exitoso) {
    console.warn(`❌ Error en rechazo masivo | ${request.name} | Status: ${response.status} | Tiempo: ${response.timings.duration}ms`);
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
  console.log('  📘 PR-01.4-02: ACCIÓN MASIVA - RECHAZAR CON RAZÓN');
  console.log('═'.repeat(79));
  console.log(`  🧪 RECHAZOS REALIZADOS: ${iteraciones}`);
  console.log(`  ✅ VALIDACIONES EXITOSAS: ${exitosos} de ${totalChecks} (${totalChecks > 0 ? ((exitosos / totalChecks) * 100).toFixed(1) : '0.0'}%)`);
  console.log(`  ❌ VALIDACIONES FALLIDAS: ${fallidos}`);
  console.log(`  📬 REQUESTS HTTP EXITOSOS: ${httpExitosos || 0} de ${data.metrics.http_reqs?.values?.count || 0}`);
  console.log(`  ⏱️  TIEMPO PROMEDIO ENVÍO CORREO: ${promedio}ms`);
  console.log(`  ⌛ TIEMPO TOTAL: ${Math.round(totalDuracion / 1000)}s`);
  console.log(`  🎯 OBJETIVO: Rechazar masivamente 300 instructores con mensaje personalizado`);

  if (fallidos === 0 && promedio <= 1000) {
    console.log(`  ✅ VALIDACIÓN: Sistema de notificaciones funcionando eficientemente`);
  } else {
    console.log(`  ⚠️ VALIDACIÓN: Tiempo de envío de correo excede el umbral de 1s`);
  }

  console.log(`  � NOTA: Evaluación del sistema de notificaciones y manejo de errores`);
  console.log('═'.repeat(79) + '\n');

  return {};
}
