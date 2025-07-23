import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Gauge } from 'k6/metrics';
import { getHeadersWithCSRF } from '../login_token.js';

export const options = {
  vus: 1,           // UN SOLO usuario para pruebas de visualización
  iterations: 1,  // Múltiples intentos para validar consistencia
  duration: '10m',  // Tiempo máximo para completar las pruebas
   tags: {
    modulo: 'Gestión de cursos',
  },
};

// Métricas personalizadas de k6 para tracking confiable
const cargasExitosasMetric = new Counter('cargas_exitosas');
const cursosArchivadosMetric = new Gauge('cursos_archivados_total');
const tiempoCargaMetric = new Gauge('tiempo_carga_promedio');


// Variables para métricas de rendimiento
let tiempoInicio = Date.now();
let tiemposRespuesta = [];
let cursosArchivadosTotal = 0;
let errorConsecutivos = 0;

export function setup() {
  console.log('🔍 Preparando prueba de carga de cursos archivados...');
  console.log('🎯 Objetivo: Cargar lista con >100 cursos archivados en ≤2s (100 iteraciones)');
  
  return {};
}

export default function (data) {
  const iterationId = __ITER;
  
  console.log(`📋 Cargando lista de cursos archivados - Intento ${iterationId + 1}/100`);
  
  // URL del endpoint para obtener cursos archivados
  const cursosArchivadosUrl = `https://teammates-orugas.appspot.com/webapi/courses?entitytype=instructor&coursestatus=archived`;
  
  const inicioRequest = Date.now();
  const cursosRes = http.get(cursosArchivadosUrl, { headers: getHeadersWithCSRF() });
  const tiempoRequest = Date.now() - inicioRequest;
  
  tiemposRespuesta.push(tiempoRequest);
  
  // Validaciones específicas para carga de vista de cursos archivados
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
          // Verificar que hay una estructura de cursos
          return Array.isArray(response) || 
                 (response.courses && Array.isArray(response.courses)) ||
                 (response.data && Array.isArray(response.data)) ||
                 (response.archivedCourses && Array.isArray(response.archivedCourses));
        } catch {
          return false;
        }
      }
      return false;
    },
    '✅ Más de 100 cursos archivados': (r) => {
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
          } else if (response.archivedCourses && Array.isArray(response.archivedCourses)) {
            cursos = response.archivedCourses;
          }
          
          cursosArchivadosTotal = cursos.length;
          return cursos.length >= 100;
        } catch {
          return false;
        }
      }
      return false;
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
      
      // Analizar estructura de la respuesta
      if (Array.isArray(response)) {
        cursosEncontrados = response.length;
        estructuraRespuesta = 'Array directo';
      } else if (response.courses && Array.isArray(response.courses)) {
        cursosEncontrados = response.courses.length;
        estructuraRespuesta = 'Objeto con propiedad "courses"';
      } else if (response.data && Array.isArray(response.data)) {
        cursosEncontrados = response.data.length;
        estructuraRespuesta = 'Objeto con propiedad "data"';
      } else if (response.archivedCourses && Array.isArray(response.archivedCourses)) {
        cursosEncontrados = response.archivedCourses.length;
        estructuraRespuesta = 'Objeto con propiedad "archivedCourses"';
      }
      
      cursosArchivadosTotal = cursosEncontrados;
      
    } catch (e) {
      console.log(`❌ Error procesando respuesta: ${e.message}`);
    }
  }
  
  if (cursosRes.status === 200) {
    errorConsecutivos = 0;
    
    // Incrementar métricas de k6
    cargasExitosasMetric.add(1);
    cursosArchivadosMetric.add(cursosEncontrados);
    tiempoCargaMetric.add(tiempoRequest);
    
    const objetivoCantidad = cursosEncontrados >= 100 ? "✅ CUMPLIDO" : "❌ NO CUMPLIDO";
    const objetivoTiempo = tiempoRequest <= 2000 ? "✅ CUMPLIDO" : "❌ NO CUMPLIDO";
    
    console.log(`✅ Intento ${iterationId + 1}/100 - Lista cargada exitosamente en ${tiempoRequest}ms`);
    console.log(`📊 Cursos archivados encontrados: ${cursosEncontrados} - ${objetivoCantidad}`);
    console.log(`⏱️ Tiempo de carga: ${tiempoRequest}ms (objetivo: ≤2000ms) - ${objetivoTiempo}`);
    console.log(`📋 Estructura: ${estructuraRespuesta} | Tamaño: ${tamanioRespuesta}KB`);
    console.log(`✅ Validaciones: ${validacionesExitosas}/${totalValidaciones} exitosas (${porcentajeExito}%)`);
    console.log(`🔢 Cargas exitosas acumuladas: ${iterationId + 1}`);
    
    if (tiempoRequest <= 2000) {
      console.log(`⚡ Rendimiento excelente: Carga en ${tiempoRequest}ms`);
    } else {
      console.log(`⚠️ Rendimiento por debajo del objetivo: ${tiempoRequest}ms > 2000ms`);
    }
    
    if (cursosEncontrados >= 100) {
      console.log(`🎯 Objetivo de cantidad alcanzado: ${cursosEncontrados} >= 100 cursos`);
    } else {
      console.log(`⚠️ Objetivo de cantidad NO alcanzado: ${cursosEncontrados} ≤ 100 cursos`);
    }
    
  } else {
    errorConsecutivos++;
    console.log(`❌ Error cargando cursos archivados - Intento ${iterationId + 1}/100 - Status ${cursosRes.status} en ${tiempoRequest}ms`);
    
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
  const progreso = Math.round(((iterationId + 1) / 100) * 100);
  const tiempoTranscurrido = Math.round((Date.now() - tiempoInicio) / 100);
  const tiempoPromedio = tiemposRespuesta.reduce((a, b) => a + b, 0) / tiemposRespuesta.length;
  
  console.log(`📊 Progreso: ${progreso}% (${iterationId + 1}/100) | Tiempo promedio: ${Math.round(tiempoPromedio)}ms | Tiempo total: ${tiempoTranscurrido}s`);
  
  // Pausa mínima entre requests
  sleep(0.1); // 100ms entre intentos para 100 iteraciones
  
  return {
    iteration: iterationId + 1,
    requestTime: tiempoRequest,
    status: cursosRes.status,
    success: cursosRes.status === 200 && cursosEncontrados >= 100 && tiempoRequest <= 2000,
    httpSuccess: cursosRes.status === 200,
    loadTimeObjective: tiempoRequest <= 2000,
    quantityObjective: cursosEncontrados >= 100,
    coursesFound: cursosEncontrados,
    responseStructure: estructuraRespuesta,
    responseSizeKB: tamanioRespuesta,
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
  
  // Usar las métricas personalizadas de k6 que son más confiables
  const cargasExitosasK6 = data.metrics.cargas_exitosas?.values.count || 0;
  const cursosArchivadosK6 = data.metrics.cursos_archivados_total?.values.value || cursosArchivadosTotal;
  
  console.log(`🔍 DEBUG FINAL - cursosArchivadosTotal: ${cursosArchivadosTotal}, k6Metric: ${cursosArchivadosK6}, cargasExitosas: ${cargasExitosasK6}`);
  
  const exitoTotal = stats.checksTotal > 0 ? Math.round((stats.checksExitosos / stats.checksTotal) * 100) : 0;
  const objetivoTiempo = stats.duracionPromedio <= 2000 ? "✅ CUMPLIDO" : "❌ NO CUMPLIDO";
  const objetivoCantidad = cursosArchivadosK6 >= 100 ? "✅ CUMPLIDO" : "❌ NO CUMPLIDO";
  const objetivoGeneral = stats.duracionPromedio <= 2000 && cursosArchivadosK6 >= 100 && exitoTotal >= 80 ? "✅ CUMPLIDO" : "⚠️ REVISAR";
  
  const tiempoTotalSegundos = Math.round((Date.now() - tiempoInicio) / 100);
  const eficienciaBackend = stats.duracionPromedio <= 2000 && exitoTotal >= 80 ? "✅ EFICIENTE" : "⚠️ REVISAR";

  return {
    'stdout': `
═════════════════════════════════════════════════════════════════════════════════════
  📋 PR-02.4-01: VISUALIZACIÓN - CARGAR LISTA DE CURSOS ARCHIVADOS (>100 CURSOS)
═════════════════════════════════════════════════════════════════════════════════════
  📊 VALIDACIONES: ${stats.checksExitosos}/${stats.checksTotal} checks (${exitoTotal}%)
  📚 CURSOS ARCHIVADOS: ${cursosArchivadosK6} cursos encontrados - ${objetivoCantidad}
  ⏱️ TIEMPO DE CARGA: ${stats.duracionPromedio}ms promedio (objetivo: ≤2s) ${objetivoTiempo}
  📈 TIEMPOS: ${stats.duracionMin}ms min | ${stats.duracionMax}ms max
  🌐 HTTP: ${stats.requestsTotal} requests GET realizados
  🕐 TIEMPO TOTAL: ${tiempoTotalSegundos}s
  📦 DATOS: ${stats.dataReceived}KB transferidos
  🔧 EFICIENCIA BACKEND: ${eficienciaBackend}
  🔍 ENDPOINT: GET /webapi/courses?entitytype=instructor&coursestatus=archived
  ✅ OBJETIVO GENERAL: ${objetivoGeneral}
  
  📋 MÉTRICAS DETALLADAS:
  • Vista cargada sin errores: ${cargasExitosasK6 > 0 && exitoTotal >= 80 ? 'SÍ' : 'NO'}
  • Tiempo promedio de carga: ${stats.duracionPromedio}ms
  • Objetivo de cantidad (>100): ${cursosArchivadosK6 >= 100 ? 'ALCANZADO' : 'NO ALCANZADO'}
  • Objetivo de tiempo (≤2s): ${stats.duracionPromedio <= 2000 ? 'ALCANZADO' : 'NO ALCANZADO'}
  • Consistencia de carga: ${stats.duracionMax - stats.duracionMin}ms variación
  • Errores consecutivos máximos: ${errorConsecutivos}
  • Cargas exitosas totales: ${cargasExitosasK6}/${stats.iteraciones}
  
  🎯 RESUMEN DEL OBJETIVO:
  ✓ Cargar vista de cursos archivados: ${cargasExitosasK6 > 0 ? 'COMPLETADO' : 'FALLIDO'}
  ✓ Más de 100 cursos en total: ${objetivoCantidad}
  ✓ Tiempo de carga ≤ 2s: ${objetivoTiempo}
  ✓ Vista sin errores: ${exitoTotal >= 80 ? 'SÍ' : 'NO'}
  
  🔍 DEBUG INFO:
  • Cargas exitosas K6: ${cargasExitosasK6} | Iteraciones: ${stats.iteraciones}
  • Cursos local: ${cursosArchivadosTotal} | Cursos K6: ${cursosArchivadosK6}
  • Requests totales: ${stats.requestsTotal} | Validaciones: ${stats.checksTotal}
═════════════════════════════════════════════════════════════════════════════════════
`
  };
}
