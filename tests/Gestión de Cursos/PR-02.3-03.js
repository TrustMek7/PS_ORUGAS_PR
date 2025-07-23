import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter } from 'k6/metrics';
import { getHeadersWithCSRF } from '../login_token.js';

export const options = {
  vus: 1,           // UN SOLO usuario para acciones masivas
  iterations: 100,  // Eliminar 100 cursos secuencialmente
  duration: '10m',  // Tiempo máximo permitido para completar el proceso
   tags: {
    modulo: 'Gestión de cursos',
  },
};

// Métricas personalizadas de k6 para tracking confiable
const cursosEliminadosMetric = new Counter('cursos_eliminados_exitosos');

// Variables para métricas de rendimiento (usando SharedArray para persistencia entre iteraciones)
import { SharedArray } from 'k6/data';

// Variables globales para tracking
let cursosEliminados = 0;
let cursosEliminadosLista = []; // Lista de cursos realmente eliminados
let tiempoInicio = Date.now();
let tiemposRespuesta = [];
let cursosDisponibles = [];
let errorConsecutivos = 0;

// Variables para stats globales usando approach compatible con k6
let globalStats = {
  eliminados: 0,
  lista: []
};

// Función para obtener lista de cursos activos
function obtenerCursosActivos() {
  const cursosActivosUrl = `https://teammates-orugas.appspot.com/webapi/courses?entitytype=instructor&coursestatus=active`;
  const cursosRes = http.get(cursosActivosUrl, { headers: getHeadersWithCSRF() });
  
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
      }
      
      // Extraer IDs de cursos
      return cursos.map(curso => {
        if (typeof curso === 'string') return curso;
        return curso.courseId || curso.id || curso.course_id;
      }).filter(id => id && id.length > 0);
      
    } catch (e) {
      console.log(`❌ Error procesando lista de cursos: ${e.message}`);
      return [];
    }
  }
  return [];
}

// Función para generar cursos de ejemplo si no hay suficientes
function generarCursoEjemplo(index) {
  const prefijos = ['CS', 'MATH', 'PHY', 'BIO', 'CHEM', 'ENG', 'HIST', 'ECON', 'PSYC', 'ART', 'MED', 'LAW', 'EDU', 'MUSIC', 'SPORT'];
  const prefijo = prefijos[index % prefijos.length];
  return `${prefijo}${101 + Math.floor(index / prefijos.length)}-ADMIN-${index}-${Date.now()}`;
}

export function setup() {
  console.log('🔍 Obteniendo lista de cursos activos para eliminar...');
  cursosDisponibles = obtenerCursosActivos();
  
  if (cursosDisponibles.length > 0) {
    console.log(`✅ Se encontraron ${cursosDisponibles.length} cursos activos disponibles para eliminar`);
  } else {
    console.log('⚠️ No se encontraron cursos activos. Se utilizarán IDs de ejemplo para el test.');
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
  
  // Obtener curso a eliminar
  let cursoId;
  if (data.cursosDisponibles && data.cursosDisponibles.length > 0) {
    cursoId = data.cursosDisponibles[iterationId % data.cursosDisponibles.length];
  } else {
    cursoId = generarCursoEjemplo(iterationId);
  }
  
  console.log(`🗑️ Eliminando curso ${iterationId + 1}/100: ${cursoId}`);
  
  // URL del endpoint para eliminar curso (basado en el ejemplo proporcionado)
  const deleteUrl = `https://teammates-orugas.appspot.com/webapi/bin/course?courseid=${encodeURIComponent(cursoId)}`;
  
  // Payload vacío para eliminación (si es requerido)
  const payload = JSON.stringify({});
  
  const inicioRequest = Date.now();
  const deleteRes = http.put(deleteUrl, payload, { headers: getHeadersWithCSRF() });
  const tiempoRequest = Date.now() - inicioRequest;
  
  tiemposRespuesta.push(tiempoRequest);
  
  // Validaciones específicas para acción masiva de eliminación
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
                   response.message?.includes('removed');
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
  });

  // Análisis de validaciones
  const validacionesExitosas = Object.values(validaciones).filter(v => v === true).length;
  const totalValidaciones = Object.keys(validaciones).length;
  const porcentajeExito = Math.round((validacionesExitosas / totalValidaciones) * 100);

  // Contabilizar cursos eliminados exitosamente
  let realmenteEliminado = false;
  if (deleteRes.status === 200) {
    // Si status es 200, considerar eliminación exitosa
    realmenteEliminado = true;
    console.log(`✅ Respuesta 200 - Curso eliminado: ${cursoId}`);
    
    // Opcionalmente, mostrar el contenido de la respuesta para debugging
    if (deleteRes.body && deleteRes.body.trim() !== '') {
      console.log(`📄 Respuesta del servidor: ${deleteRes.body.substring(0, 100)}...`);
    }
  } else {
    console.log(`❌ Error Status ${deleteRes.status} - Curso NO eliminado: ${cursoId}`);
    if (deleteRes.body) {
      console.log(`📄 Error body: ${deleteRes.body.substring(0, 150)}...`);
    }
  }
  
  if (realmenteEliminado) {
    cursosEliminados++;
    globalStats.eliminados++;
    cursosEliminadosLista.push(cursoId); // Agregar a la lista de eliminados
    globalStats.lista.push(cursoId);
    
    // Incrementar la métrica personalizada de k6
    cursosEliminadosMetric.add(1);
    
    errorConsecutivos = 0;
    console.log(`✅ Curso ${iterationId + 1}/100 ELIMINADO exitosamente en ${tiempoRequest}ms - ${cursoId} (Total: ${cursosEliminados})`);
    console.log(`🔢 Counter Global: ${globalStats.eliminados} | Metric K6: ${cursosEliminadosMetric.value || 'N/A'} | Validaciones: ${validacionesExitosas}/${totalValidaciones}`);
    
    if (tiempoRequest <= 3000) {
      console.log(`⚡ Rendimiento excelente: Eliminado en ${tiempoRequest}ms (objetivo: ≤3s)`);
    }
  } else {
    errorConsecutivos++;
    console.log(`❌ Error eliminando curso ${iterationId + 1}/100 - Status ${deleteRes.status} en ${tiempoRequest}ms`);
    console.log(`🔢 Total eliminados hasta ahora: ${cursosEliminados} | Global: ${globalStats.eliminados}`);
    
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
    
    // Si hay muchos errores consecutivos, reportar problema
    if (errorConsecutivos >= 5) {
      console.log(`🚨 ALERTA: ${errorConsecutivos} errores consecutivos detectados. Posible problema del sistema.`);
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
    
    // Mostrar lista de cursos realmente eliminados cada 10 iteraciones
    if (cursosEliminadosLista.length > 0) {
      console.log(`🗑️ CURSOS ELIMINADOS REALMENTE: [${cursosEliminadosLista.join(', ')}]`);
    } else {
      console.log(`⚠️ NINGÚN CURSO ELIMINADO AÚN`);
    }
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
  
  // Usar la métrica personalizada de k6 que es más confiable
  const cursosEliminadosK6 = data.metrics.cursos_eliminados_exitosos?.values.count || 0;
  const cursosEliminadosActual = Math.max(cursosEliminados, globalStats.eliminados, cursosEliminadosK6);
  const listaEliminadosActual = globalStats.lista.length > cursosEliminadosLista.length ? globalStats.lista : cursosEliminadosLista;
  
  console.log(`🔍 DEBUG FINAL - cursosEliminados: ${cursosEliminados}, globalStats.eliminados: ${globalStats.eliminados}, k6Metric: ${cursosEliminadosK6}`);
  console.log(`🔍 DEBUG FINAL - lista length: ${cursosEliminadosLista.length}, global lista length: ${globalStats.lista.length}`);
  console.log(`🔍 DEBUG FINAL - usando: ${cursosEliminadosActual} eliminados y ${listaEliminadosActual.length} en lista`);
  
  const exitoTotal = stats.checksTotal > 0 ? Math.round((stats.checksExitosos / stats.checksTotal) * 100) : 0;
  const cursosObjetivo = 100;
  const objetivoAlcanzado = cursosEliminadosActual >= cursosObjetivo ? "✅ CUMPLIDO" : cursosEliminadosActual >= cursosObjetivo * 0.8 ? "⚠️ PARCIAL" : "❌ NO CUMPLIDO";
  const rendimientoObjetivo = stats.duracionPromedio <= 3000 ? "✅ CUMPLE" : "❌ NO CUMPLE";
  const eficienciaBackend = stats.duracionPromedio <= 3000 && exitoTotal >= 80 ? "✅ EFICIENTE" : "⚠️ REVISAR";
  
  const tiempoTotalSegundos = Math.round((Date.now() - tiempoInicio) / 1000);
  const tiempoTotalMinutos = Math.round(tiempoTotalSegundos / 60);
  const throughput = tiempoTotalSegundos > 0 ? Math.round((cursosEliminadosActual / tiempoTotalSegundos) * 60) : 0; // cursos por minuto

  return {
    'stdout': `
═════════════════════════════════════════════════════════════════════════════════════
  🗑️ PR-02.3-03: ACCIÓN MASIVA - ELIMINAR TODOS LOS CURSOS ACTIVOS (100 CURSOS)
═════════════════════════════════════════════════════════════════════════════════════
  📊 VALIDACIONES: ${stats.checksExitosos}/${stats.checksTotal} checks (${exitoTotal}%)
  🎯 CURSOS ELIMINADOS: ${cursosEliminadosActual}/${cursosObjetivo} cursos - ${objetivoAlcanzado}
  ⏱️ RENDIMIENTO: ${stats.duracionPromedio}ms promedio (objetivo: ≤3s) ${rendimientoObjetivo}
  📈 TIEMPOS: ${stats.duracionMin}ms min | ${stats.duracionMax}ms max
  🌐 HTTP: ${stats.requestsTotal} requests PUT realizados
  ⚡ THROUGHPUT: ${throughput} cursos/minuto
  🕐 TIEMPO TOTAL: ${tiempoTotalMinutos} minutos (${tiempoTotalSegundos}s)
  📦 DATOS: ${stats.dataReceived}KB transferidos
  🔧 EFICIENCIA BACKEND: ${eficienciaBackend}
  🔍 ENDPOINT: PUT /webapi/bin/course?courseid={courseId}
  ✅ OBJETIVO: Validar eficiencia del backend para acciones masivas de eliminación
  
  📋 MÉTRICAS DETALLADAS:
  • Tasa de éxito: ${Math.round((cursosEliminadosActual / cursosObjetivo) * 100)}%
  • Tiempo promedio por curso: ${stats.duracionPromedio}ms
  • Cursos procesados por segundo: ${tiempoTotalSegundos > 0 ? Math.round(cursosEliminadosActual / tiempoTotalSegundos) : 0}
  • Errores consecutivos máximos: ${errorConsecutivos}
  
  🗑️ CURSOS REALMENTE ELIMINADOS (${cursosEliminadosK6}):
  ${cursosEliminadosK6 >= 10 ? `SE ELIMINARON ${cursosEliminadosK6} CURSOS EXITOSAMENTE` : listaEliminadosActual.length > 0 ? listaEliminadosActual.map((curso, index) => `${index + 1}. ${curso}`).join('\n  ') : 'NINGÚN CURSO ELIMINADO'}
  
  🔍 DEBUG INFO:
  • Counter local: ${cursosEliminados} | Counter global: ${globalStats.eliminados} | K6 Metric: ${cursosEliminadosK6}
  • Lista local: ${cursosEliminadosLista.length} | Lista global: ${globalStats.lista.length}
  • Iteraciones: ${stats.iteraciones} | Requests: ${stats.requestsTotal}
  • Validaciones totales realizadas: ${stats.checksTotal}
═════════════════════════════════════════════════════════════════════════════════════
`
  };
}
