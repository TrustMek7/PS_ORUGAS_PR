import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Gauge } from 'k6/metrics';
import { getHeadersWithCSRF } from '../login_token.js';

export const options = {
  vus: 1,           // UN SOLO usuario para acciones masivas
  iterations: 100,  // Eliminar 100 cursos archivados secuencialmente
  duration: '10m',  // Tiempo máximo permitido para completar el proceso
   tags: {
    modulo: 'Gestión de cursos',
  },
};

// Métricas k6 para tracking confiable
const cursosEliminadosMetric = new Counter('cursos_archivados_eliminados_exitosos');
const tiempoEliminacionMetric = new Gauge('tiempo_eliminacion_promedio_ms');

// Información del administrador para acceder a los cursos
const administrador = {
  email: 'jcusilaymeg@unsa.edu.pe',  // Usuario funcional descubierto
  name: 'Juan Carlos Usilay Mejia',
  institute: 'UNSA'
};

// Variables para métricas de rendimiento
let cursosEliminados = 0;
let tiempoInicio = Date.now();
let tiemposRespuesta = [];
let cursosDisponibles = [];
let errorConsecutivos = 0;

// Función para obtener lista de cursos archivados
function obtenerCursosArchivados() {
  const cursosArchivadosUrl = `https://teammates-orugas.appspot.com/webapi/courses?entitytype=instructor&coursestatus=archived`;
  const cursosRes = http.get(cursosArchivadosUrl, { headers: getHeadersWithCSRF() });
  
  if (cursosRes.status === 200 && cursosRes.body) {
    try {
      const cursosData = JSON.parse(cursosRes.body);
      let cursos = [];
      
      // Extraer cursos según la estructura de respuesta
      if (Array.isArray(cursosData)) {
        cursos = cursosData;
      } else if (cursosData.courses && Array.isArray(cursosData.courses)) {
        cursos = cursosData.courses;
      } else if (cursosData.data && Array.isArray(cursosData.data)) {
        cursos = cursosData.data;
      } else if (cursosData.archivedCourses && Array.isArray(cursosData.archivedCourses)) {
        cursos = cursosData.archivedCourses;
      }
      
      // Extraer IDs de cursos
      return cursos.map(curso => {
        if (typeof curso === 'string') return curso;
        return curso.courseId || curso.id || curso.course_id;
      }).filter(id => id && id.length > 0);
      
    } catch (e) {
      console.log(`❌ Error procesando lista de cursos archivados: ${e.message}`);
      return [];
    }
  }
  return [];
}

// Función para generar cursos de ejemplo si no hay suficientes
function generarCursoEjemplo(index) {
  const prefijos = ['CS', 'MATH', 'PHY', 'BIO', 'CHEM', 'ENG', 'HIST', 'ECON', 'PSYC', 'ART', 'MED', 'LAW', 'EDU', 'MUSIC', 'SPORT'];
  const prefijo = prefijos[index % prefijos.length];
  return `${prefijo}${201 + Math.floor(index / prefijos.length)}-ADMIN-${index}-${Date.now()}`;
}

export function setup() {
  console.log('🔍 Obteniendo lista de cursos archivados para eliminar...');
  cursosDisponibles = obtenerCursosArchivados();
  
  if (cursosDisponibles.length > 0) {
    console.log(`✅ Se encontraron ${cursosDisponibles.length} cursos archivados disponibles para eliminar`);
  } else {
    console.log('⚠️ No se encontraron cursos archivados. Se utilizarán IDs de ejemplo para el test.');
    // Generar IDs de ejemplo para testing
    for (let i = 0; i < 100; i++) {
      cursosDisponibles.push(generarCursoEjemplo(i));
    }
  }
  
  return { cursosDisponibles };
}

export default function (data) {
  const iterationId = __ITER;
  const totalIteraciones = 100;
  
  // Obtener curso archivado a eliminar
  let cursoId;
  if (data.cursosDisponibles && data.cursosDisponibles.length > 0) {
    cursoId = data.cursosDisponibles[iterationId % data.cursosDisponibles.length];
  } else {
    cursoId = generarCursoEjemplo(iterationId);
  }
  
  console.log(`🗑️ Eliminando curso archivado ${iterationId + 1}/100: ${cursoId}`);
  
  // URL del endpoint para eliminar curso archivado (basado en el ejemplo proporcionado)
  const deleteUrl = `https://teammates-orugas.appspot.com/webapi/bin/course?courseid=${encodeURIComponent(cursoId)}`;
  
  // Payload vacío para eliminación (si es requerido)
  const payload = JSON.stringify({});
  
  const inicioRequest = Date.now();
  const deleteRes = http.put(deleteUrl, payload, { headers: getHeadersWithCSRF() });
  const tiempoRequest = Date.now() - inicioRequest;
  
  tiemposRespuesta.push(tiempoRequest);
  
  // Validaciones específicas para acción masiva de eliminación de cursos archivados
  const validaciones = check(deleteRes, {
    '✅ Respuesta HTTP exitosa': (r) => r.status === 200,
    '✅ Acción rápida (≤3s)': (r) => tiempoRequest <= 3000,
    '✅ Sin errores del servidor': (r) => r.status !== 500 && r.status !== 502 && r.status !== 503,
    '✅ Autenticación válida': (r) => r.status !== 401 && r.status !== 403,
    '✅ Curso encontrado': (r) => r.status !== 404,
    '✅ Operación permitida': (r) => r.status !== 405 && r.status !== 409,
    '✅ Eliminación exitosa': (r) => {
      // Verificar que el curso fue eliminado exitosamente
      if (r.status === 200) {
        try {
          // Si hay respuesta JSON, verificar campos de confirmación
          if (r.body && r.body.trim() !== '') {
            const response = JSON.parse(r.body);
            // Buscar indicadores de eliminación exitosa
            return response.deleted === true || 
                   response.success === true || 
                   response.status === 'deleted' ||
                   response.message?.includes('deleted') ||
                   response.message?.includes('removed') ||
                   response.message?.includes('eliminado');
          }
          // Si no hay body o está vacío, asumir éxito basado en HTTP 200
          return true;
        } catch {
          // Si no es JSON válido pero status es 200, asumir éxito
          return true;
        }
      }
      return false;
    },
    '✅ Consistencia en eliminación': (r) => {
      // Validar que la eliminación es consistente (sin errores intermedios)
      if (r.status === 200) {
        try {
          if (r.body && r.body.trim() !== '') {
            const response = JSON.parse(r.body);
            // Verificar que no hay errores de consistencia
            return !response.error && 
                   !response.warning && 
                   response.status !== 'partial' &&
                   response.status !== 'error';
          }
          return true;
        } catch {
          return true;
        }
      }
      return false;
    },
  });

  // Análisis de validaciones
  const validacionesExitosas = Object.values(validaciones).filter(v => v === true).length;
  const totalValidaciones = Object.keys(validaciones).length;
  const porcentajeExito = Math.round((validacionesExitosas / totalValidaciones) * 100);

  // Contabilizar cursos eliminados exitosamente
  let realmenteEliminado = false;
  if (deleteRes.status === 200) {
    try {
      if (deleteRes.body && deleteRes.body.trim() !== '') {
        const response = JSON.parse(deleteRes.body);
        // Verificar indicadores de eliminación
        realmenteEliminado = response.deleted === true || 
                           response.success === true || 
                           response.status === 'deleted' ||
                           response.message?.includes('deleted') ||
                           response.message?.includes('removed') ||
                           response.message?.includes('eliminado');
      } else {
        // Si no hay respuesta pero status 200, asumir éxito
        realmenteEliminado = true;
      }
    } catch (e) {
      // Si error al parsear pero status 200, asumir éxito
      realmenteEliminado = true;
    }
  }
  
  if (realmenteEliminado) {
    cursosEliminados++;
    cursosEliminadosMetric.add(1); // Incrementar métrica k6
    tiempoEliminacionMetric.add(tiempoRequest); // Actualizar métrica de tiempo
    errorConsecutivos = 0;
    console.log(`✅ Curso archivado ${iterationId + 1}/100 ELIMINADO exitosamente en ${tiempoRequest}ms - ${cursoId} (${validacionesExitosas}/${totalValidaciones} validaciones exitosas)`);
    console.log(`   🎯 Total eliminados acumulados: ${cursosEliminados}`);
    
    if (tiempoRequest <= 3000) {
      console.log(`⚡ Rendimiento excelente: Eliminado en ${tiempoRequest}ms (objetivo: ≤3s)`);
    }
    
    // Verificar consistencia de eliminación
    if (validacionesExitosas === totalValidaciones) {
      console.log(`🎯 Eliminación consistente: Sin errores intermedios`);
    }
  } else if (deleteRes.status === 200) {
    console.log(`⚠️ Curso ${iterationId + 1}/100 - HTTP 200 pero eliminación incierta en ${tiempoRequest}ms - ${cursoId} (${validacionesExitosas}/${totalValidaciones} validaciones exitosas)`);
    console.log(`🔍 Respuesta: ${deleteRes.body?.substring(0, 100)}...`);
    errorConsecutivos++;
  } else {
    errorConsecutivos++;
    console.log(`❌ Error eliminando curso archivado ${iterationId + 1}/100 - Status ${deleteRes.status} en ${tiempoRequest}ms (${validacionesExitosas}/${totalValidaciones} validaciones exitosas)`);
    
    if (deleteRes.body) {
      console.log(`   Detalles: ${deleteRes.body.substring(0, 200)}`);
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
    
    // Si hay muchos errores consecutivos, reportar problema de consistencia
    if (errorConsecutivos >= 5) {
      console.log(`🚨 ALERTA: ${errorConsecutivos} errores consecutivos detectados. Posible problema de consistencia en eliminación.`);
    }
  }
  
  // Métricas de progreso
  const progreso = Math.round(((iterationId + 1) / totalIteraciones) * 100);
  const tiempoTranscurrido = Math.round((Date.now() - tiempoInicio) / 1000);
  const cursosRestantes = totalIteraciones - (iterationId + 1);
  const tiempoPromedio = tiemposRespuesta.reduce((a, b) => a + b, 0) / tiemposRespuesta.length;
  const tiempoEstimado = Math.round((cursosRestantes * tiempoPromedio) / 1000);
  
  if ((iterationId + 1) % 10 === 0 || iterationId === 0) {
    console.log(`📊 Progreso: ${progreso}% (${iterationId + 1}/${totalIteraciones}) | Eliminados: ${cursosEliminados} | Tiempo: ${tiempoTranscurrido}s | ETA: ${tiempoEstimado}s`);
  }
  
  // Pausa mínima entre requests para mantener rendimiento del backend
  sleep(0.1); // 100ms entre eliminaciones para eficiencia del backend
  
  return {
    iteration: iterationId + 1,
    courseId: cursoId,
    requestTime: tiempoRequest,
    status: deleteRes.status,
    success: realmenteEliminado, // Solo éxito si realmente se eliminó
    httpSuccess: deleteRes.status === 200, // Éxito HTTP separado
    validationsSuccessful: validacionesExitosas,
    validationsTotal: totalValidaciones,
    validationsPercentage: porcentajeExito,
    validationResults: validaciones,
    consecutiveErrors: errorConsecutivos,
    totalDeleted: cursosEliminados,
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
  
  // Usar métricas k6 en lugar de variables globales
  const cursosEliminadosTotal = data.metrics.cursos_archivados_eliminados_exitosos?.values.count || 0;
  const tiempoEliminacionPromedio = Math.round(data.metrics.tiempo_eliminacion_promedio_ms?.values.avg || 0);
  
  // Debug información de métricas
  console.log(`🔍 DEBUG FINAL - cursosEliminadosTotal: ${cursosEliminados}, k6Metric: ${cursosEliminadosTotal}`);
  console.log(`🔍 DEBUG FINAL - tiempoPromedio: ${stats.duracionPromedio}ms, eliminacionMetric: ${tiempoEliminacionPromedio}ms`);
  
  const exitoTotal = stats.checksTotal > 0 ? Math.round((stats.checksExitosos / stats.checksTotal) * 100) : 0;
  const cursosObjetivo = 100;
  const objetivoAlcanzado = cursosEliminadosTotal >= cursosObjetivo ? "✅ CUMPLIDO" : cursosEliminadosTotal >= cursosObjetivo * 0.8 ? "⚠️ PARCIAL" : "❌ NO CUMPLIDO";
  const rendimientoObjetivo = stats.duracionPromedio <= 3000 ? "✅ CUMPLE" : "❌ NO CUMPLE";
  const eficienciaBackend = stats.duracionPromedio <= 3000 && exitoTotal >= 80 ? "✅ EFICIENTE" : "⚠️ REVISAR";
  const consistenciaEliminacion = errorConsecutivos <= 2 ? "✅ CONSISTENTE" : "⚠️ INCONSISTENTE";
  
  const tiempoTotalSegundos = Math.round((Date.now() - tiempoInicio) / 1000);
  const tiempoTotalMinutos = Math.round(tiempoTotalSegundos / 60);
  const throughput = tiempoTotalSegundos > 0 ? Math.round((cursosEliminadosTotal / tiempoTotalSegundos) * 60) : 0; // cursos por minuto

  return {
    'stdout': `
═════════════════════════════════════════════════════════════════════════════════════
  🗑️ PR-02.4-03: ACCIÓN MASIVA - ELIMINAR TODOS LOS CURSOS ARCHIVADOS (100 CURSOS)
═════════════════════════════════════════════════════════════════════════════════════
  📊 VALIDACIONES: ${stats.checksExitosos}/${stats.checksTotal} checks (${exitoTotal}%)
  🎯 CURSOS ELIMINADOS: ${cursosEliminadosTotal}/${cursosObjetivo} cursos - ${objetivoAlcanzado}
  ⏱️ RENDIMIENTO: ${stats.duracionPromedio}ms promedio (objetivo: ≤3s) ${rendimientoObjetivo}
  📈 TIEMPOS: ${stats.duracionMin}ms min | ${stats.duracionMax}ms max
  🌐 HTTP: ${stats.requestsTotal} requests PUT realizados
  ⚡ THROUGHPUT: ${throughput} cursos/minuto
  🕐 TIEMPO TOTAL: ${tiempoTotalMinutos} minutos (${tiempoTotalSegundos}s)
  📦 DATOS: ${stats.dataReceived}KB transferidos
  🔧 EFICIENCIA BACKEND: ${eficienciaBackend}
  🎯 CONSISTENCIA ELIMINACIÓN: ${consistenciaEliminacion}
  🔍 ENDPOINT: PUT /webapi/bin/course?courseid={courseId}
  ✅ OBJETIVO: Validar eliminación masiva de cursos archivados con consistencia
  
  📋 MÉTRICAS DETALLADAS:
  • Tasa de éxito: ${Math.round((cursosEliminadosTotal / cursosObjetivo) * 100)}%
  • Tiempo promedio por curso: ${stats.duracionPromedio}ms
  • Cursos procesados por segundo: ${tiempoTotalSegundos > 0 ? Math.round(cursosEliminadosTotal / tiempoTotalSegundos) : 0}
  • Errores consecutivos máximos: ${errorConsecutivos}
  • Consistencia en eliminación intermedia: ${consistenciaEliminacion}
  
  🎯 OBJETIVOS ESPECÍFICOS:
  ✓ Eliminar 100 cursos archivados: ${objetivoAlcanzado}
  ✓ Acción ≤ 3s por curso: ${rendimientoObjetivo}
  ✓ Todos eliminados correctamente: ${cursosEliminadosTotal === cursosObjetivo ? "✅ SÍ" : "❌ NO"}
  ✓ Consistencia en eliminación intermedia: ${consistenciaEliminacion}
═════════════════════════════════════════════════════════════════════════════════════
`
  };
}
