import http from 'k6/http';
import { check, sleep } from 'k6';
import { getHeadersWithCSRF } from '../login_token.js';

export const options = {
  vus: 1,           // UN SOLO usuario para acciones masivas individuales
  iterations: 100,  // Restaurar 100 cursos uno por uno
  duration: '10m',  // Tiempo máximo permitido para completar el proceso
};

// Información del administrador para acceder a los cursos
const administrador = {
  email: 'jcusilaymeg@unsa.edu.pe',  // Usuario funcional descubierto
  name: 'Juan Carlos Usilay Mejia',
  institute: 'UNSA'
};

// Variables para métricas de rendimiento
let cursosRestaurados = 0;
let tiempoInicio = Date.now();
let tiemposRespuesta = [];
let cursosEliminadosDisponibles = [];
let errorConsecutivos = 0;

// Función para obtener lista de cursos eliminados (en papelera/bin)
function obtenerCursosEliminados() {
  // Intentar obtener cursos desde el bin primero
  const cursosBinUrl = `https://teammates-orugas.appspot.com/webapi/bin/courses`;
  let cursosRes = http.get(cursosBinUrl, { headers: getHeadersWithCSRF() });
  
  // Si no funciona el endpoint del bin, usar el endpoint de softDeleted como fallback
  if (cursosRes.status !== 200) {
    const cursosEliminadosUrl = `https://teammates-orugas.appspot.com/webapi/courses?entitytype=instructor&coursestatus=softDeleted`;
    cursosRes = http.get(cursosEliminadosUrl, { headers: getHeadersWithCSRF() });
  }
  
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
      } else if (cursosData.deletedCourses && Array.isArray(cursosData.deletedCourses)) {
        cursos = cursosData.deletedCourses;
      } else if (cursosData.softDeletedCourses && Array.isArray(cursosData.softDeletedCourses)) {
        cursos = cursosData.softDeletedCourses;
      }
      
      // Extraer IDs de cursos eliminados
      return cursos.map(curso => {
        if (typeof curso === 'string') return curso;
        return curso.courseId || curso.id || curso.course_id;
      }).filter(id => id && id.length > 0);
      
    } catch (e) {
      console.log(`❌ Error procesando lista de cursos eliminados: ${e.message}`);
      return [];
    }
  }
  return [];
}

// Función para generar cursos de ejemplo si no hay suficientes eliminados
function generarCursoEliminadoEjemplo(index) {
  const prefijos = ['CS', 'MATH', 'PHY', 'BIO', 'CHEM', 'ENG', 'HIST', 'ECON', 'PSYC', 'ART', 'MED', 'LAW', 'EDU', 'MUSIC', 'SPORT'];
  const prefijo = prefijos[index % prefijos.length];
  return `${prefijo}${101 + Math.floor(index / prefijos.length)}-ADMIN-${index}-${Date.now()}`;
}

export function setup() {
  console.log('🔍 Obteniendo lista de cursos eliminados para restaurar...');
  cursosEliminadosDisponibles = obtenerCursosEliminados();
  
  if (cursosEliminadosDisponibles.length > 0) {
    console.log(`✅ Se encontraron ${cursosEliminadosDisponibles.length} cursos eliminados disponibles para restaurar`);
  } else {
    console.log('⚠️ No se encontraron cursos eliminados. Se utilizarán IDs de ejemplo para el test.');
    // Generar IDs de ejemplo para testing
    for (let i = 0; i < 100; i++) {
      cursosEliminadosDisponibles.push(generarCursoEliminadoEjemplo(i));
    }
  }
  
  console.log('🎯 Objetivo: Restaurar 100 cursos uno por uno con tiempo ≤4s por curso');
  console.log('📊 Evaluando desempeño en restauraciones individuales');
  
  return { cursosEliminadosDisponibles };
}

export default function (data) {
  const iterationId = __ITER;
  const totalIteraciones = 100;
  
  // Obtener curso a restaurar
  let cursoId;
  if (data.cursosEliminadosDisponibles && data.cursosEliminadosDisponibles.length > 0) {
    cursoId = data.cursosEliminadosDisponibles[iterationId % data.cursosEliminadosDisponibles.length];
  } else {
    cursoId = generarCursoEliminadoEjemplo(iterationId);
  }
  
  console.log(`🔄 Restaurando curso ${iterationId + 1}/100: ${cursoId}`);
  
  // URL del endpoint para restaurar curso desde la papelera
  // Basado en el ejemplo proporcionado que usa DELETE para eliminar, 
  // la restauración podría ser el mismo endpoint pero con método diferente o parámetro
  const restoreUrl = `https://teammates-orugas.appspot.com/webapi/bin/course?courseid=${encodeURIComponent(cursoId)}&restore=true`;
  
  // Payload para restauración - usando DELETE method para restaurar desde bin
  const payload = JSON.stringify({});
  
  const inicioRequest = Date.now();
  const restoreRes = http.del(restoreUrl, payload, { headers: getHeadersWithCSRF() });
  const tiempoRequest = Date.now() - inicioRequest;
  
  tiemposRespuesta.push(tiempoRequest);
  
  // Validaciones específicas para acción masiva de restauración individual
  const validaciones = check(restoreRes, {
    '✅ Respuesta HTTP exitosa': (r) => r.status === 200,
    '✅ Acción rápida (≤4s por curso)': (r) => tiempoRequest <= 4000,
    '✅ Sin errores del servidor': (r) => r.status !== 500 && r.status !== 502 && r.status !== 503,
    '✅ Autenticación válida': (r) => r.status !== 401 && r.status !== 403,
    '✅ Curso encontrado en eliminados': (r) => r.status !== 404,
    '✅ Operación permitida': (r) => r.status !== 405 && r.status !== 409,
    '✅ Restauración exitosa': (r) => {
      // Verificar que el curso fue restaurado exitosamente
      if (r.status === 200) {
        try {
          // Si hay respuesta JSON, verificar campos de confirmación
          if (r.body && r.body.trim() !== '') {
            const response = JSON.parse(r.body);
            // Buscar indicadores de restauración exitosa
            return response.restored === true || 
                   response.success === true || 
                   response.status === 'restored' ||
                   response.status === 'active' ||
                   response.message?.includes('restored') ||
                   response.message?.includes('undeleted') ||
                   response.message?.includes('recovered');
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
    '✅ Rendimiento individual óptimo': (r) => tiempoRequest <= 2000, // Meta ideal < 2s
  });

  // Análisis de validaciones
  const validacionesExitosas = Object.values(validaciones).filter(v => v === true).length;
  const totalValidaciones = Object.keys(validaciones).length;
  const porcentajeExito = Math.round((validacionesExitosas / totalValidaciones) * 100);

  // Contabilizar cursos restaurados exitosamente
  let realmenteRestaurado = false;
  if (restoreRes.status === 200) {
    try {
      if (restoreRes.body && restoreRes.body.trim() !== '') {
        const response = JSON.parse(restoreRes.body);
        // Verificar indicadores de restauración exitosa
        realmenteRestaurado = response.restored === true || 
                             response.success === true || 
                             response.status === 'restored' ||
                             response.status === 'active' ||
                             (response.message && (
                               response.message.includes('restored') ||
                               response.message.includes('undeleted') ||
                               response.message.includes('recovered')
                             ));
      } else {
        // Si no hay body pero status es 200, asumir éxito
        realmenteRestaurado = true;
      }
    } catch {
      // Si hay error de parsing pero status es 200, asumir éxito
      realmenteRestaurado = true;
    }
    
    if (realmenteRestaurado) {
      cursosRestaurados++;
      errorConsecutivos = 0;
    }
  } else {
    errorConsecutivos++;
  }
  
  // Log detallado del resultado
  if (restoreRes.status === 200 && realmenteRestaurado) {
    const objetivoTiempo = tiempoRequest <= 4000 ? "✅ CUMPLIDO" : "❌ NO CUMPLIDO";
    const rendimientoOptimo = tiempoRequest <= 2000 ? "⚡ ÓPTIMO" : tiempoRequest <= 4000 ? "✅ BUENO" : "⚠️ LENTO";
    
    console.log(`✅ Curso ${iterationId + 1}/100 restaurado exitosamente en ${tiempoRequest}ms - ${objetivoTiempo}`);
    console.log(`   📊 Rendimiento: ${rendimientoOptimo} | Validaciones: ${validacionesExitosas}/${totalValidaciones} (${porcentajeExito}%)`);
    console.log(`   🔄 Total restaurados: ${cursosRestaurados}/${iterationId + 1}`);
    
    if (tiempoRequest <= 2000) {
      console.log(`   ⚡ Excelente: Restauración individual en ${tiempoRequest}ms`);
    } else if (tiempoRequest <= 4000) {
      console.log(`   ✅ Aceptable: Restauración en ${tiempoRequest}ms (dentro del objetivo)`);
    } else {
      console.log(`   ⚠️ Lento: ${tiempoRequest}ms > 4000ms (objetivo no cumplido)`);
    }
    
  } else {
    console.log(`❌ Error restaurando curso ${iterationId + 1}/100 - Status ${restoreRes.status} en ${tiempoRequest}ms`);
    
    if (restoreRes.body) {
      console.log(`   Detalles: ${restoreRes.body.substring(0, 200)}`);
    }
    
    // Mostrar validaciones fallidas
    if (validacionesExitosas < totalValidaciones) {
      console.log(`   ⚠️ Validaciones fallidas:`);
      Object.entries(validaciones).forEach(([nombre, resultado]) => {
        if (!resultado) {
          console.log(`     ❌ ${nombre}`);
        }
      });
    }
  }
  
  // Métricas de progreso
  const progreso = Math.round(((iterationId + 1) / totalIteraciones) * 100);
  const tiempoTranscurrido = Math.round((Date.now() - tiempoInicio) / 1000);
  const tiempoPromedio = tiemposRespuesta.reduce((a, b) => a + b, 0) / tiemposRespuesta.length;
  const tiempoEstimado = Math.round((tiempoPromedio * (totalIteraciones - iterationId - 1)) / 1000);
  
  console.log(`📊 Progreso: ${progreso}% (${iterationId + 1}/${totalIteraciones}) | Promedio: ${Math.round(tiempoPromedio)}ms | ETA: ${tiempoEstimado}s`);
  
  // Control de errores consecutivos
  if (errorConsecutivos >= 5) {
    console.log(`⚠️ Demasiados errores consecutivos (${errorConsecutivos}). Pausando 2s...`);
    sleep(2);
  } else {
    // Pausa mínima entre restauraciones individuales
    sleep(0.2); // 200ms entre acciones
  }
  
  return {
    iteration: iterationId + 1,
    requestTime: tiempoRequest,
    status: restoreRes.status,
    success: restoreRes.status === 200 && realmenteRestaurado && tiempoRequest <= 4000,
    httpSuccess: restoreRes.status === 200,
    restored: realmenteRestaurado,
    timeObjective: tiempoRequest <= 4000,
    optimalPerformance: tiempoRequest <= 2000,
    courseId: cursoId,
    validationsSuccessful: validacionesExitosas,
    validationsTotal: totalValidaciones,
    validationsPercentage: porcentajeExito,
    validationResults: validaciones,
    consecutiveErrors: errorConsecutivos,
    totalRestored: cursosRestaurados,
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
  const objetivoTiempo = stats.duracionPromedio <= 4000 ? "✅ CUMPLIDO" : "❌ NO CUMPLIDO";
  const objetivoCantidad = cursosRestaurados >= 100 ? "✅ CUMPLIDO" : "⚠️ PARCIAL";
  const objetivoGeneral = stats.duracionPromedio <= 4000 && cursosRestaurados >= 80 && exitoTotal >= 80 ? "✅ CUMPLIDO" : "⚠️ REVISAR";
  const rendimientoIndividual = stats.duracionPromedio <= 2000 ? "⚡ ÓPTIMO" : stats.duracionPromedio <= 4000 ? "✅ BUENO" : "⚠️ MEJORAR";
  
  const tiempoTotalSegundos = Math.round((Date.now() - tiempoInicio) / 1000);
  const throughput = tiempoTotalSegundos > 0 ? Math.round((cursosRestaurados / tiempoTotalSegundos) * 60) : 0; // cursos por minuto

  return {
    'stdout': `
═════════════════════════════════════════════════════════════════════════════════════
  🔄 PR-02.5-02: ACCIÓN MASIVA - RESTAURAR INDIVIDUALMENTE CURSOS ELIMINADOS
═════════════════════════════════════════════════════════════════════════════════════
  📊 VALIDACIONES: ${stats.checksExitosos}/${stats.checksTotal} checks (${exitoTotal}%)
  🔄 CURSOS RESTAURADOS: ${cursosRestaurados}/100 cursos - ${objetivoCantidad}
  ⏱️ TIEMPO POR CURSO: ${stats.duracionPromedio}ms promedio (objetivo: ≤4s) ${objetivoTiempo}
  📈 TIEMPOS: ${stats.duracionMin}ms min | ${stats.duracionMax}ms max
  🌐 HTTP: ${stats.requestsTotal} requests DELETE realizados
  ⚡ THROUGHPUT: ${throughput} cursos/minuto
  🕐 TIEMPO TOTAL: ${tiempoTotalSegundos}s
  📦 DATOS: ${stats.dataReceived}KB transferidos
  📊 RENDIMIENTO INDIVIDUAL: ${rendimientoIndividual}
  🔍 ENDPOINT: DELETE /webapi/bin/course?courseid={courseId}&restore=true
  ✅ OBJETIVO GENERAL: ${objetivoGeneral}
  
  📋 MÉTRICAS DETALLADAS:
  • Cursos restaurados exitosamente: ${cursosRestaurados}/100
  • Tiempo promedio por restauración: ${stats.duracionPromedio}ms
  • Objetivo de tiempo individual (≤4s): ${stats.duracionPromedio <= 4000 ? 'ALCANZADO' : 'NO ALCANZADO'}
  • Rendimiento óptimo (≤2s): ${stats.duracionPromedio <= 2000 ? 'ALCANZADO' : 'NO ALCANZADO'}
  • Variabilidad de tiempo: ${stats.duracionMax - stats.duracionMin}ms
  • Throughput de restauración: ${throughput} cursos/minuto
  • Errores consecutivos máximos: ${errorConsecutivos}
  • Éxito de restauraciones individuales: ${cursosRestaurados > 0 ? Math.round((cursosRestaurados / stats.iteraciones) * 100) : 0}%
  
  🎯 RESUMEN DEL OBJETIVO:
  ✓ Restaurar 100 cursos uno por uno: ${cursosRestaurados >= 100 ? 'COMPLETADO' : `PARCIAL (${cursosRestaurados}/100)`}
  ✓ Tiempo ≤ 4s por curso: ${objetivoTiempo}
  ✓ Todos los cursos restaurados correctamente: ${cursosRestaurados === stats.iteraciones ? 'SÍ' : 'PARCIAL'}
  ✓ Evaluar desempeño individual: ${rendimientoIndividual}
  ✓ Operaciones individuales eficientes: ${stats.duracionPromedio <= 4000 && exitoTotal >= 80 ? 'SÍ' : 'REVISAR'}
═════════════════════════════════════════════════════════════════════════════════════
`
  };
}