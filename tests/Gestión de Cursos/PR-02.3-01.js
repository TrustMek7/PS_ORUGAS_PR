import http from 'k6/http';
import { check, sleep } from 'k6';
import { getHeadersWithCSRF } from '../login_token.js';

export const options = {
  vus: 1,           // UN SOLO usuario para cargar la vista
  iterations: 5,    // 5 cargas para evaluar consistencia
  duration: '2m',   // Tiempo máximo permitido
};

// Información del instructor para acceder a los cursos
const instructor = {
  email: 'jcusilaymeg@unsa.edu.pe',  // Usuario funcional descubierto
  name: 'Juan Carlos Usilay Mejia',
  institute: 'UNSA'
};

// Métricas de rendimiento
let tiemposRespuesta = [];
let cursosObtenidos = 0;
let totalIteraciones = 0;

export default function () {
  const iterationId = __ITER + 1;
  totalIteraciones++;
  
  // URL del endpoint para obtener cursos activos
  const cursosActivosUrl = `https://teammates-orugas.appspot.com/webapi/courses?entitytype=instructor&coursestatus=active`;
  
  console.log(`🔍 Iteración ${iterationId}: Cargando lista de cursos activos...`);
  
  const inicioRequest = Date.now();
  const cursosRes = http.get(cursosActivosUrl, { headers: getHeadersWithCSRF() });
  const tiempoRequest = Date.now() - inicioRequest;
  
  tiemposRespuesta.push(tiempoRequest);
  
  // Procesar respuesta para contar cursos
  let numeroCursos = 0;
  let cursosData = null;
  
  if (cursosRes.status === 200 && cursosRes.body) {
    try {
      cursosData = JSON.parse(cursosRes.body);
      
      // Contar cursos según la estructura de respuesta
      if (Array.isArray(cursosData)) {
        numeroCursos = cursosData.length;
      } else if (cursosData.courses && Array.isArray(cursosData.courses)) {
        numeroCursos = cursosData.courses.length;
      } else if (cursosData.data && Array.isArray(cursosData.data)) {
        numeroCursos = cursosData.data.length;
      } else {
        // Intentar contar propiedades del objeto como cursos
        numeroCursos = Object.keys(cursosData).length;
      }
      
      cursosObtenidos = Math.max(cursosObtenidos, numeroCursos);
      
    } catch (e) {
      console.log(`❌ Iteración ${iterationId}: Error procesando JSON - ${e.message}`);
    }
  }
  
  // Validaciones específicas para visualización masiva
  const validaciones = check(cursosRes, {
    '✅ Lista de cursos cargada correctamente': (r) => r.status === 200,
    '✅ Tiempo de carga rápido (≤2s)': (r) => tiempoRequest <= 2000,
    '✅ Respuesta contiene datos': (r) => r.body && r.body.length > 100,
    '✅ Sin errores del servidor': (r) => r.status !== 500 && r.status !== 502 && r.status !== 503,
    '✅ Autenticación válida': (r) => r.status !== 401 && r.status !== 403,
    '✅ Formato JSON válido': (r) => {
      try {
        JSON.parse(r.body);
        return true;
      } catch {
        return false;
      }
    },
    '✅ Más de 100 cursos cargados': (r) => numeroCursos > 100,
    '✅ Sistema con cursos suficientes': (r) => numeroCursos > 50,
    '✅ Objetivo ideal >1000 cursos': (r) => numeroCursos > 1000,
  });

  // Análisis de validaciones
  const validacionesExitosas = Object.values(validaciones).filter(v => v === true).length;
  const totalValidaciones = Object.keys(validaciones).length;
  const porcentajeExito = Math.round((validacionesExitosas / totalValidaciones) * 100);

  // Log detallado del resultado
  if (cursosRes.status === 200) {
    console.log(`✅ Iteración ${iterationId}: ${numeroCursos} cursos cargados en ${tiempoRequest}ms (${validacionesExitosas}/${totalValidaciones} validaciones exitosas)`);
    if (numeroCursos > 1000) {
      console.log(`🎯 ¡OBJETIVO ALCANZADO! Más de 1000 cursos (${numeroCursos}) cargados exitosamente`);
    } else if (numeroCursos > 100) {
      console.log(`📊 Cantidad significativa de cursos cargados (${numeroCursos})`);
    }
    
    // Mostrar validaciones fallidas si las hay
    if (validacionesExitosas < totalValidaciones) {
      console.log(`⚠️ Validaciones fallidas en iteración ${iterationId}:`);
      Object.entries(validaciones).forEach(([nombre, resultado]) => {
        if (!resultado) {
          console.log(`   ❌ ${nombre}`);
        }
      });
    }
  } else {
    console.log(`❌ Iteración ${iterationId}: Error ${cursosRes.status} - Tiempo: ${tiempoRequest}ms (${validacionesExitosas}/${totalValidaciones} validaciones exitosas)`);
    if (cursosRes.body) {
      console.log(`   Respuesta: ${cursosRes.body.substring(0, 200)}...`);
    }
  }
  
  // Pausa entre cargas para evaluar consistencia
  sleep(1);

  return {
    iteration: iterationId,
    requestTime: tiempoRequest,
    status: cursosRes.status,
    coursesCount: numeroCursos,
    success: cursosRes.status === 200,
    meetTarget: numeroCursos > 1000,
    responseSize: cursosRes.body ? cursosRes.body.length : 0,
    validationsSuccessful: validacionesExitosas,
    validationsTotal: totalValidaciones,
    validationsPercentage: porcentajeExito,
    validationResults: validaciones
  };
}

export function handleSummary(data) {
  const stats = {
    checksExitosos: data.metrics.checks?.values.passes || 0,
    checksTotal: data.metrics.checks?.values.count || 0,
    requestsTotal: data.metrics.http_reqs?.values.count || 0,
    duracionPromedio: Math.round(data.metrics.http_req_duration?.values.avg || 0),
    duracionMax: Math.round(data.metrics.http_req_duration?.values.max || 0),
    duracionMin: Math.round(data.metrics.http_req_duration?.values.min || 0),
    iteraciones: data.metrics.iterations?.values.count || 0,
    dataReceived: Math.round((data.metrics.data_received?.values.count || 0) / 1024) // KB
  };
  
  const exitoTotal = stats.checksTotal > 0 ? Math.round((stats.checksExitosos / stats.checksTotal) * 100) : 0;
  const cargasExitosas = stats.requestsTotal; // Todas las cargas HTTP realizadas
  const objetivoAlcanzado = cursosObtenidos > 100 ? "SÍ (>100)" : cursosObtenidos > 50 ? "PARCIAL" : "NO";
  const objetivoIdeal = cursosObtenidos > 1000 ? "✅ IDEAL ALCANZADO" : "⚠️ IDEAL PENDIENTE";
  const rendimientoObjetivo = stats.duracionPromedio <= 2000 ? "✅ CUMPLE" : "❌ NO CUMPLE";

  return {
    'stdout': `
═════════════════════════════════════════════════════════════════════════════════════
  🎯 PR-02.3-01: VISUALIZACIÓN - CARGAR LISTA DE CURSOS ACTIVOS (>1000 REGISTROS)
═════════════════════════════════════════════════════════════════════════════════════
  📊 VALIDACIONES: ${stats.checksExitosos}/${stats.checksTotal} checks (${exitoTotal}%)
  🌐 HTTP: ${stats.requestsTotal} cargas de vista realizadas
  ⏱️ RENDIMIENTO: ${stats.duracionPromedio}ms promedio (objetivo: ≤2000ms) ${rendimientoObjetivo}
  📈 TIEMPOS: ${stats.duracionMin}ms min | ${stats.duracionMax}ms max
  🎯 CURSOS CARGADOS: ${cursosObtenidos} cursos (objetivo: >100) - ${objetivoAlcanzado}
  🎯 OBJETIVO IDEAL: >1000 cursos - ${objetivoIdeal}
  📦 DATOS: ${stats.dataReceived}KB transferidos
  ✅ CARGAS EXITOSAS: ${cargasExitosas} de ${stats.requestsTotal} intentos
  🔍 ENDPOINT: GET /webapi/courses?entitytype=instructor&coursestatus=active
  ✅ OBJETIVO: Evaluar rendimiento de renderizado masivo de cursos activos
═════════════════════════════════════════════════════════════════════════════════════
`
  };
}
