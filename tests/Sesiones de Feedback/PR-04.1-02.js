import http from 'k6/http';
import { check } from 'k6';
import { SharedArray } from 'k6/data';
import { getHeadersWithCSRF } from '../login_token.js';

export const options = {
  vus: 1,
  iterations: 500,
  thresholds: {
    'http_req_duration': ['p(95)<3000'], // Acción masiva ≤ 3s (95%)
    'checks': ['rate>0.95']
  },
  tags: {
    modulo: 'Sesiones de Feedback',
  },
};

// ⚠️ Reemplaza con tu ID real del curso
const COURSE_ID = 'TESTID';

// 📥 Cargar sesiones desde archivo y generar timestamps válidos
const sesiones = new SharedArray('sesiones', function () {
  try {
    const contenido = open('./sesiones.txt');
    const ahora = new Date();
    
    return contenido
      .split('\n')
      .map(linea => linea.trim())
      .filter(linea => linea.length > 0 && linea.includes('|'))
      .map((linea, index) => {
        const partes = linea.split('|').map(p => p.trim());
        
        // Crear timestamp válido: próxima hora exacta + offset por sesión
        const proximaHora = new Date(ahora);
        proximaHora.setHours(ahora.getHours() + 3 + index); // +3 horas + offset
        proximaHora.setMinutes(0, 0, 0); // Exactamente en la marca de hora
        
        const finSesion = new Date(proximaHora);
        finSesion.setHours(proximaHora.getHours() + 24); // +24 horas después
        
        return {
          feedbackSessionName: partes[0] + `-${Date.now()}-${index}`, // Hacer nombres únicos
          instructions: partes[1] || "Instrucciones de la sesión de feedback",
          submissionStartTimestamp: proximaHora.getTime(),
          submissionEndTimestamp: finSesion.getTime(),
          gracePeriod: 15, // 15 minutos de período de gracia
        };
      });
  } catch (error) {
    throw new Error(`Error al leer archivo de sesiones: ${error}`);
  }
});

export default function () {
  const sesion = sesiones[__ITER % sesiones.length];

  const payload = JSON.stringify({
    ...sesion,
    sessionVisibleSetting: "AT_OPEN",
    customSessionVisibleTimestamp: 0,
    responseVisibleSetting: "LATER",
    customResponseVisibleTimestamp: 0,
    isClosingSoonEmailEnabled: true,
    isPublishedEmailEnabled: true,
  });

  const headers = getHeadersWithCSRF();

  const res = http.post(`https://teammates-orugas.appspot.com/webapi/session?courseid=${COURSE_ID}`, payload, {
    headers: { ...headers, 'Content-Type': 'application/json' }
  });

  console.log(`🛠️ Creando sesión ${__ITER + 1}: ${sesion.feedbackSessionName}`);
  
  const success = check(res, {
    '✅ PR-04.1-02: Solicitud exitosa (201 o 200)': r => r.status === 200 || r.status === 201,
    '✅ PR-04.1-02: Tiempo ≤ 3s': r => r.timings.duration <= 3000,
    '✅ PR-04.1-02: Respuesta válida': r => {
      try {
        return r.body && r.body.length > 0;
      } catch {
        return false;
      }
    }
  });

  if (success) {
    console.log(`✅ Sesión creada exitosamente | ${res.timings.duration}ms`);
  } else {
    console.log(`❌ Error: Status ${res.status} | ${res.timings.duration}ms`);
    if (res.body && res.body.length < 500) {
      console.log(`📝 Respuesta: ${res.body}`);
    }
  }
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
  🎯 PR-04.1-02: CARGA MASIVA - CREAR MÚLTIPLES SESIONES DE FEEDBACK
═══════════════════════════════════════════════════════════════════════════════
  📊 RESUMEN: ${stats.checksExitosos}/${stats.checksTotal} checks (${exitoTotal}%)
  🌐 HTTP: ${stats.requestsTotal} requests, ${stats.requestsFallidos}% fallidos, ${stats.duracionPromedio}ms promedio
  ⏱️ TIEMPO: ${stats.tiempoTotal}s total, ${stats.iteraciones} iteraciones
  🎯 OBJETIVO: Validar creación masiva de sesiones de feedback
═══════════════════════════════════════════════════════════════════════════════
`
  };
}
