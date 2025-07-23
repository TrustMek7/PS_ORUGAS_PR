import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Gauge } from 'k6/metrics';
import { getHeadersWithCSRF } from '../login_token.js';

export const options = {
  vus: 1,           // UN SOLO usuario para acciones masivas
  iterations: 100,  // Archivar 100 cursos secuencialmente
  duration: '10m',  // Tiempo máximo permitido para completar el proceso
   tags: {
    modulo: 'Gestión de cursos',
  },
};

// Métricas k6 para tracking confiable
const cursosArchivadosMetric = new Counter('cursos_archivados_exitosos');
const tiempoArchivoMetric = new Gauge('tiempo_archivo_promedio_ms');

// Información del administrador para acceder a los cursos
const administrador = {
  email: 'jcusilaymeg@unsa.edu.pe',  // Usuario funcional descubierto
  name: 'Juan Carlos Usilay Mejia',
  institute: 'UNSA'
};

// Variables para métricas de rendimiento
let cursosArchivados = 0;
let tiempoInicio = Date.now();
let tiemposRespuesta = [];
let cursosDisponibles = [];
let errorConsecutivos = 0;

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
  return `${prefijo}${201 + Math.floor(index / prefijos.length)}-ADMIN-${index}-${Date.now()}`;
}

export function setup() {
  console.log('🔍 Obteniendo lista de cursos activos para archivar...');
  cursosDisponibles = obtenerCursosActivos();
  
  if (cursosDisponibles.length > 0) {
    console.log(`✅ Se encontraron ${cursosDisponibles.length} cursos activos disponibles para archivar`);
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
  
  // Obtener curso a archivar
  let cursoId;
  if (data.cursosDisponibles && data.cursosDisponibles.length > 0) {
    cursoId = data.cursosDisponibles[iterationId % data.cursosDisponibles.length];
  } else {
    cursoId = generarCursoEjemplo(iterationId);
  }
  
  console.log(`📦 Archivando curso ${iterationId + 1}/100: ${cursoId}`);
  
  // URL del endpoint para archivar curso (basado en el ejemplo proporcionado)
  const archiveUrl = `https://teammates-orugas.appspot.com/webapi/course/archive?courseid=${encodeURIComponent(cursoId)}`;
  
  // Payload JSON con el flag correcto para archivar
  const payload = JSON.stringify({ archiveStatus: true });
  
  const inicioRequest = Date.now();
  const archiveRes = http.put(archiveUrl, payload, { headers: getHeadersWithCSRF() });
  const tiempoRequest = Date.now() - inicioRequest;
  
  tiemposRespuesta.push(tiempoRequest);
  
  // Validaciones específicas para acción masiva de archivado
  const validaciones = check(archiveRes, {
    '✅ Respuesta HTTP exitosa': (r) => r.status === 200,
    '✅ Acción rápida (≤3s)': (r) => tiempoRequest <= 3000,
    '✅ Sin errores del servidor': (r) => r.status !== 500 && r.status !== 502 && r.status !== 503,
    '✅ Autenticación válida': (r) => r.status !== 401 && r.status !== 403,
    '✅ Curso encontrado': (r) => r.status !== 404,
    '✅ Operación permitida': (r) => r.status !== 405 && r.status !== 409,
    '✅ Curso archivado': (r) => {
      if (r.status === 200 && r.body) {
        try {
          const response = JSON.parse(r.body);
          return response.isArchived === true;
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

  // Contabilizar cursos archivados exitosamente (solo si realmente se archivaron)
  let realmenteArchivado = false;
  if (archiveRes.status === 200 && archiveRes.body) {
    try {
      const response = JSON.parse(archiveRes.body);
      realmenteArchivado = response.isArchived === true;
    } catch (e) {
      realmenteArchivado = false;
    }
  }
  
  if (realmenteArchivado) {
    cursosArchivados++;
    cursosArchivadosMetric.add(1); // Incrementar métrica k6
    tiempoArchivoMetric.add(tiempoRequest); // Actualizar métrica de tiempo
    errorConsecutivos = 0;
    console.log(`✅ Curso ${iterationId + 1}/100 REALMENTE archivado en ${tiempoRequest}ms - ${cursoId} (${validacionesExitosas}/${totalValidaciones} validaciones exitosas)`);
    console.log(`   🎯 Total archivados acumulados: ${cursosArchivados}`);
    
    if (tiempoRequest <= 3000) {
      console.log(`⚡ Rendimiento excelente: Archivado en ${tiempoRequest}ms (objetivo: ≤3s)`);
    }
  } else if (archiveRes.status === 200) {
    console.log(`⚠️ Curso ${iterationId + 1}/100 - HTTP 200 pero NO archivado (isArchived=false) en ${tiempoRequest}ms - ${cursoId} (${validacionesExitosas}/${totalValidaciones} validaciones exitosas)`);
    console.log(`🔍 Respuesta: ${archiveRes.body?.substring(0, 100)}...`);
    errorConsecutivos++;
  } else {
    errorConsecutivos++;
    console.log(`❌ Error archivando curso ${iterationId + 1}/100 - Status ${archiveRes.status} en ${tiempoRequest}ms (${validacionesExitosas}/${totalValidaciones} validaciones exitosas)`);
    
    if (archiveRes.body) {
      console.log(`   Detalles: ${archiveRes.body.substring(0, 200)}`);
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
    console.log(`📊 Progreso: ${progreso}% (${iterationId + 1}/${totalIteraciones}) | Archivados: ${cursosArchivados} | Tiempo: ${tiempoTranscurrido}s | ETA: ${tiempoEstimado}s`);
  }
  
  // Pausa mínima entre requests para mantener rendimiento
  sleep(0.1); // 100ms entre archivados para eficiencia del backend
  
  return {
    iteration: iterationId + 1,
    courseId: cursoId,
    requestTime: tiempoRequest,
    status: archiveRes.status,
    success: realmenteArchivado, // Solo éxito si realmente se archivó
    httpSuccess: archiveRes.status === 200, // Éxito HTTP separado
    validationsSuccessful: validacionesExitosas,
    validationsTotal: totalValidaciones,
    validationsPercentage: porcentajeExito,
    validationResults: validaciones,
    consecutiveErrors: errorConsecutivos,
    totalArchived: cursosArchivados,
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
  const cursosArchivadosTotal = data.metrics.cursos_archivados_exitosos?.values.count || 0;
  const tiempoArchivoPromedio = Math.round(data.metrics.tiempo_archivo_promedio_ms?.values.avg || 0);
  
  // Debug información de métricas
  console.log(`🔍 DEBUG FINAL - cursosArchivadosTotal: ${cursosArchivados}, k6Metric: ${cursosArchivadosTotal}`);
  console.log(`🔍 DEBUG FINAL - tiempoPromedio: ${stats.duracionPromedio}ms, archivoMetric: ${tiempoArchivoPromedio}ms`);
  
  const exitoTotal = stats.checksTotal > 0 ? Math.round((stats.checksExitosos / stats.checksTotal) * 100) : 0;
  const cursosObjetivo = 100;
  const objetivoAlcanzado = cursosArchivadosTotal >= cursosObjetivo ? "✅ CUMPLIDO" : cursosArchivadosTotal >= cursosObjetivo * 0.8 ? "⚠️ PARCIAL" : "❌ NO CUMPLIDO";
  const rendimientoObjetivo = stats.duracionPromedio <= 3000 ? "✅ CUMPLE" : "❌ NO CUMPLE";
  const eficienciaBackend = stats.duracionPromedio <= 3000 && exitoTotal >= 80 ? "✅ EFICIENTE" : "⚠️ REVISAR";
  
  const tiempoTotalSegundos = Math.round((Date.now() - tiempoInicio) / 1000);
  const tiempoTotalMinutos = Math.round(tiempoTotalSegundos / 60);
  const throughput = tiempoTotalSegundos > 0 ? Math.round((cursosArchivadosTotal / tiempoTotalSegundos) * 60) : 0; // cursos por minuto

  return {
    'stdout': `
═════════════════════════════════════════════════════════════════════════════════════
  🗂️ PR-02.3-02: ACCIÓN MASIVA - ARCHIVAR TODOS LOS CURSOS ACTIVOS (100 CURSOS)
═════════════════════════════════════════════════════════════════════════════════════
  📊 VALIDACIONES: ${stats.checksExitosos}/${stats.checksTotal} checks (${exitoTotal}%)
  🎯 CURSOS ARCHIVADOS: ${cursosArchivadosTotal}/${cursosObjetivo} cursos - ${objetivoAlcanzado}
  ⏱️ RENDIMIENTO: ${stats.duracionPromedio}ms promedio (objetivo: ≤3s) ${rendimientoObjetivo}
  📈 TIEMPOS: ${stats.duracionMin}ms min | ${stats.duracionMax}ms max
  🌐 HTTP: ${stats.requestsTotal} requests PUT realizados
  ⚡ THROUGHPUT: ${throughput} cursos/minuto
  🕐 TIEMPO TOTAL: ${tiempoTotalMinutos} minutos (${tiempoTotalSegundos}s)
  📦 DATOS: ${stats.dataReceived}KB transferidos
  🔧 EFICIENCIA BACKEND: ${eficienciaBackend}
  🔍 ENDPOINT: PUT /webapi/course/archive?courseid={courseId}
  ✅ OBJETIVO: Validar eficiencia del backend para acciones masivas de archivado
  
  📋 MÉTRICAS DETALLADAS:
  • Tasa de éxito: ${Math.round((cursosArchivadosTotal / cursosObjetivo) * 100)}%
  • Tiempo promedio por curso: ${stats.duracionPromedio}ms
  • Cursos procesados por segundo: ${tiempoTotalSegundos > 0 ? Math.round(cursosArchivadosTotal / tiempoTotalSegundos) : 0}
  • Errores consecutivos máximos: ${errorConsecutivos}
═════════════════════════════════════════════════════════════════════════════════════
`
  };
}
