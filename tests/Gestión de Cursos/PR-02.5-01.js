import http from 'k6/http';
import { check, sleep } from 'k6';
import { getHeadersWithCSRF } from '../login_token.js';

export const options = {
  vus: 1,           // UN SOLO usuario para pruebas de visualización
  iterations: 5,    // Múltiples intentos para validar consistencia
  duration: '2m',   // Tiempo máximo para completar las pruebas
   tags: {
    modulo: 'Gestión de cursos',
  },
};

// Información del administrador para acceder a los cursos
const administrador = {
  email: 'jcusilaymeg@unsa.edu.pe',  // Usuario funcional descubierto
  name: 'Juan Carlos Usilay Mejia',
  institute: 'UNSA'
};

// Variables para métricas de rendimiento
let tiempoInicio = Date.now();
let tiemposRespuesta = [];
let cursosEliminadosTotal = 0;
let errorConsecutivos = 0;

export function setup() {
  console.log('🔍 Preparando prueba de carga de cursos eliminados (soft deleted)...');
  console.log('🎯 Objetivo: Cargar lista con >1000 cursos eliminados en ≤2s');
  console.log('📊 Validar rendimiento del historial de eliminaciones');
  
  return {};
}

export default function (data) {
  const iterationId = __ITER;
  
  console.log(`🗑️ Cargando lista de cursos eliminados - Intento ${iterationId + 1}/5`);
  
  // URL del endpoint para obtener cursos eliminados (soft deleted)
  const cursosEliminadosUrl = `https://teammates-orugas.appspot.com/webapi/courses?entitytype=instructor&coursestatus=softDeleted`;
  
  const inicioRequest = Date.now();
  const cursosRes = http.get(cursosEliminadosUrl, { headers: getHeadersWithCSRF() });
  const tiempoRequest = Date.now() - inicioRequest;
  
  tiemposRespuesta.push(tiempoRequest);
  
  // Validaciones específicas para carga de vista de cursos eliminados
  const validaciones = check(cursosRes, {
    '✅ Respuesta HTTP exitosa': (r) => r.status === 200,
    '✅ Carga rápida (≤2s)': (r) => tiempoRequest <= 2000,
    '✅ Sin errores del servidor': (r) => r.status !== 500 && r.status !== 502 && r.status !== 503,
    '✅ Autenticación válida': (r) => r.status !== 401 && r.status !== 403,
    '✅ Endpoint disponible': (r) => r.status !== 404,
    '✅ Operación permitida': (r) => r.status !== 405,
    '✅ Respuesta con contenido': (r) => r.body && r.body.length > 0,
    '✅ Formato JSON válido': (r) => {
      if (r.status === 200 && r.body) {
        try {
          JSON.parse(r.body);
          return true;
        } catch {
          return false;
        }
      }
      return false;
    },
    '✅ Lista de cursos presente': (r) => {
      if (r.status === 200 && r.body) {
        try {
          const response = JSON.parse(r.body);
          // Verificar que hay una estructura de cursos eliminados
          return Array.isArray(response) || 
                 (response.courses && Array.isArray(response.courses)) ||
                 (response.data && Array.isArray(response.data)) ||
                 (response.deletedCourses && Array.isArray(response.deletedCourses)) ||
                 (response.softDeletedCourses && Array.isArray(response.softDeletedCourses));
        } catch {
          return false;
        }
      }
      return false;
    },
    '✅ Más de 1000 cursos eliminados': (r) => {
      if (r.status === 200 && r.body) {
        try {
          const response = JSON.parse(r.body);
          let cursos = [];
          
          // Extraer cursos según la estructura de respuesta
          if (Array.isArray(response)) {
            cursos = response;
          } else if (response.courses && Array.isArray(response.courses)) {
            cursos = response.courses;
          } else if (response.data && Array.isArray(response.data)) {
            cursos = response.data;
          } else if (response.deletedCourses && Array.isArray(response.deletedCourses)) {
            cursos = response.deletedCourses;
          } else if (response.softDeletedCourses && Array.isArray(response.softDeletedCourses)) {
            cursos = response.softDeletedCourses;
          }
          
          cursosEliminadosTotal = cursos.length;
          return cursos.length > 1000;
        } catch {
          return false;
        }
      }
      return false;
    },
    '✅ Rendimiento del historial óptimo': (r) => {
      // Validar que el historial de eliminaciones no degrada el rendimiento
      return r.status === 200 && tiempoRequest <= 2000;
    },
  });

  // Análisis de validaciones
  const validacionesExitosas = Object.values(validaciones).filter(v => v === true).length;
  const totalValidaciones = Object.keys(validaciones).length;
  const porcentajeExito = Math.round((validacionesExitosas / totalValidaciones) * 100);

  // Análisis detallado de la respuesta
  let cursosEncontrados = 0;
  let estructuraRespuesta = 'Desconocida';
  let tamanioRespuesta = cursosRes.body ? Math.round(cursosRes.body.length / 1024) : 0; // KB
  
  if (cursosRes.status === 200 && cursosRes.body) {
    try {
      const response = JSON.parse(cursosRes.body);
      
      // Analizar estructura de la respuesta para cursos eliminados
      if (Array.isArray(response)) {
        cursosEncontrados = response.length;
        estructuraRespuesta = 'Array directo';
      } else if (response.courses && Array.isArray(response.courses)) {
        cursosEncontrados = response.courses.length;
        estructuraRespuesta = 'Objeto con propiedad "courses"';
      } else if (response.data && Array.isArray(response.data)) {
        cursosEncontrados = response.data.length;
        estructuraRespuesta = 'Objeto con propiedad "data"';
      } else if (response.deletedCourses && Array.isArray(response.deletedCourses)) {
        cursosEncontrados = response.deletedCourses.length;
        estructuraRespuesta = 'Objeto con propiedad "deletedCourses"';
      } else if (response.softDeletedCourses && Array.isArray(response.softDeletedCourses)) {
        cursosEncontrados = response.softDeletedCourses.length;
        estructuraRespuesta = 'Objeto con propiedad "softDeletedCourses"';
      }
      
      cursosEliminadosTotal = cursosEncontrados;
      
    } catch (e) {
      console.log(`❌ Error procesando respuesta: ${e.message}`);
    }
  }
  
  if (cursosRes.status === 200) {
    errorConsecutivos = 0;
    
    const objetivoCantidad = cursosEncontrados > 1000 ? "✅ CUMPLIDO" : "❌ NO CUMPLIDO";
    const objetivoTiempo = tiempoRequest <= 2000 ? "✅ CUMPLIDO" : "❌ NO CUMPLIDO";
    const rendimientoHistorial = tiempoRequest <= 2000 && cursosEncontrados > 0 ? "✅ ÓPTIMO" : "⚠️ REVISAR";
    
    console.log(`✅ Intento ${iterationId + 1}/5 - Lista de cursos eliminados cargada exitosamente en ${tiempoRequest}ms`);
    console.log(`🗑️ Cursos eliminados encontrados: ${cursosEncontrados} - ${objetivoCantidad}`);
    console.log(`⏱️ Tiempo de carga: ${tiempoRequest}ms (objetivo: ≤2000ms) - ${objetivoTiempo}`);
    console.log(`📋 Estructura: ${estructuraRespuesta} | Tamaño: ${tamanioRespuesta}KB`);
    console.log(`📊 Rendimiento del historial: ${rendimientoHistorial}`);
    console.log(`✅ Validaciones: ${validacionesExitosas}/${totalValidaciones} exitosas (${porcentajeExito}%)`);
    
    if (tiempoRequest <= 2000) {
      console.log(`⚡ Rendimiento excelente: Carga de historial en ${tiempoRequest}ms`);
    } else {
      console.log(`⚠️ Rendimiento por debajo del objetivo: ${tiempoRequest}ms > 2000ms`);
    }
    
    if (cursosEncontrados > 1000) {
      console.log(`🎯 Objetivo de cantidad alcanzado: ${cursosEncontrados} > 1000 cursos eliminados`);
    } else {
      console.log(`⚠️ Objetivo de cantidad NO alcanzado: ${cursosEncontrados} ≤ 1000 cursos eliminados`);
    }
    
  } else {
    errorConsecutivos++;
    console.log(`❌ Error cargando cursos eliminados - Intento ${iterationId + 1}/5 - Status ${cursosRes.status} en ${tiempoRequest}ms`);
    
    if (cursosRes.body) {
      console.log(`   Detalles: ${cursosRes.body.substring(0, 200)}`);
    }
    
    // Mostrar validaciones fallidas
    if (validacionesExitosas < totalValidaciones) {
      console.log(`⚠️ Validaciones fallidas:`);
      Object.entries(validaciones).forEach(([nombre, resultado]) => {
        if (!resultado) {
          console.log(`   ❌ ${nombre}`);
        }
      });
    }
  }
  
  // Métricas de progreso
  const progreso = Math.round(((iterationId + 1) / 5) * 100);
  const tiempoTranscurrido = Math.round((Date.now() - tiempoInicio) / 1000);
  const tiempoPromedio = tiemposRespuesta.reduce((a, b) => a + b, 0) / tiemposRespuesta.length;
  
  console.log(`📊 Progreso: ${progreso}% (${iterationId + 1}/5) | Tiempo promedio: ${Math.round(tiempoPromedio)}ms | Tiempo total: ${tiempoTranscurrido}s`);
  
  // Pausa mínima entre requests
  sleep(0.5); // 500ms entre intentos
  
  return {
    iteration: iterationId + 1,
    requestTime: tiempoRequest,
    status: cursosRes.status,
    success: cursosRes.status === 200 && cursosEncontrados > 1000 && tiempoRequest <= 2000,
    httpSuccess: cursosRes.status === 200,
    loadTimeObjective: tiempoRequest <= 2000,
    quantityObjective: cursosEncontrados > 1000,
    coursesFound: cursosEncontrados,
    responseStructure: estructuraRespuesta,
    responseSizeKB: tamanioRespuesta,
    historyPerformance: tiempoRequest <= 2000 && cursosEncontrados > 0,
    validationsSuccessful: validacionesExitosas,
    validationsTotal: totalValidaciones,
    validationsPercentage: porcentajeExito,
    validationResults: validaciones,
    consecutiveErrors: errorConsecutivos,
    progress: progreso
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
  const objetivoTiempo = stats.duracionPromedio <= 2000 ? "✅ CUMPLIDO" : "❌ NO CUMPLIDO";
  const objetivoCantidad = cursosEliminadosTotal > 1000 ? "✅ CUMPLIDO" : "❌ NO CUMPLIDO";
  const objetivoGeneral = stats.duracionPromedio <= 2000 && cursosEliminadosTotal > 1000 && exitoTotal >= 80 ? "✅ CUMPLIDO" : "⚠️ REVISAR";
  const rendimientoHistorial = stats.duracionPromedio <= 2000 && exitoTotal >= 80 ? "✅ ÓPTIMO" : "⚠️ REVISAR";
  
  const tiempoTotalSegundos = Math.round((Date.now() - tiempoInicio) / 1000);

  return {
    'stdout': `
═════════════════════════════════════════════════════════════════════════════════════
  🗑️ PR-02.5-01: VISUALIZACIÓN - CARGAR LISTA DE CURSOS ELIMINADOS (>1000 CURSOS)
═════════════════════════════════════════════════════════════════════════════════════
  📊 VALIDACIONES: ${stats.checksExitosos}/${stats.checksTotal} checks (${exitoTotal}%)
  🗑️ CURSOS ELIMINADOS: ${cursosEliminadosTotal} cursos encontrados - ${objetivoCantidad}
  ⏱️ TIEMPO DE CARGA: ${stats.duracionPromedio}ms promedio (objetivo: ≤2s) ${objetivoTiempo}
  📈 TIEMPOS: ${stats.duracionMin}ms min | ${stats.duracionMax}ms max
  🌐 HTTP: ${stats.requestsTotal} requests GET realizados
  🕐 TIEMPO TOTAL: ${tiempoTotalSegundos}s
  📦 DATOS: ${stats.dataReceived}KB transferidos
  📊 RENDIMIENTO HISTORIAL: ${rendimientoHistorial}
  🔍 ENDPOINT: GET /webapi/courses?entitytype=instructor&coursestatus=softDeleted
  ✅ OBJETIVO GENERAL: ${objetivoGeneral}
  
  📋 MÉTRICAS DETALLADAS:
  • Lista cargada correctamente: ${stats.requestsTotal > 0 && exitoTotal >= 80 ? 'SÍ' : 'NO'}
  • Tiempo promedio de carga: ${stats.duracionPromedio}ms
  • Objetivo de cantidad (>1000): ${cursosEliminadosTotal > 1000 ? 'ALCANZADO' : 'NO ALCANZADO'}
  • Objetivo de tiempo (≤2s): ${stats.duracionPromedio <= 2000 ? 'ALCANZADO' : 'NO ALCANZADO'}
  • Consistencia de carga: ${stats.duracionMax - stats.duracionMin}ms variación
  • Rendimiento del historial de eliminaciones: ${rendimientoHistorial}
  • Errores consecutivos máximos: ${errorConsecutivos}
  
  🎯 RESUMEN DEL OBJETIVO:
  ✓ Cargar vista de cursos eliminados: ${stats.requestsTotal > 0 ? 'COMPLETADO' : 'FALLIDO'}
  ✓ Más de 1000 cursos eliminados: ${objetivoCantidad}
  ✓ Tiempo de carga ≤ 2s: ${objetivoTiempo}
  ✓ Lista cargada correctamente: ${exitoTotal >= 80 ? 'SÍ' : 'NO'}
  ✓ Validar rendimiento del historial: ${rendimientoHistorial}
═════════════════════════════════════════════════════════════════════════════════════
`
  };
}
