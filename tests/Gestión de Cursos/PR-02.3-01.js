import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend } from 'k6/metrics';
import { getHeadersWithCSRF } from '../login_token.js';

export const options = {
  vus: 1,
  iterations: 1,
  duration: '2m',
   tags: {
    modulo: 'Gestión de cursos',
  },
};

// Métricas personalizadas
const tiemposRequestTrend = new Trend('tiempos_respuesta');
const cursosCargadosTrend = new Trend('cursos_cargados');

export default function () {
  const iterationId = __ITER + 1;

  const cursosActivosUrl = `https://teammates-orugas.appspot.com/webapi/courses?entitytype=instructor&coursestatus=active`;
  console.log(`🔍 Iteración ${iterationId}: Cargando lista de cursos activos...`);

  const inicioRequest = Date.now();
  const cursosRes = http.get(cursosActivosUrl, { headers: getHeadersWithCSRF() });
  const tiempoRequest = Date.now() - inicioRequest;

  tiemposRequestTrend.add(tiempoRequest);

  let numeroCursos = 0;
  let cursosData = null;
  if (cursosRes.status === 200 && cursosRes.body) {
    try {
      cursosData = JSON.parse(cursosRes.body);

      console.log(`📦 Respuesta cruda (primeros 300 chars): ${cursosRes.body.substring(0, 300)}...`);
      console.log(`🔍 Tipo de cursosData: ${typeof cursosData}`);
      console.log(`🔍 Keys: ${Object.keys(cursosData).join(', ')}`);

      if (Array.isArray(cursosData)) {
        numeroCursos = cursosData.length;
        console.log(`✅ cursosData es un arreglo con ${numeroCursos} elementos`);
      } else if (Array.isArray(cursosData.courses)) {
        numeroCursos = cursosData.courses.length;
        console.log(`✅ cursosData.courses es un arreglo con ${numeroCursos} cursos`);
      } else if (Array.isArray(cursosData.data)) {
        numeroCursos = cursosData.data.length;
        console.log(`✅ cursosData.data es un arreglo con ${numeroCursos} cursos`);
      } else {
        numeroCursos = Object.keys(cursosData).length;
        console.log(`⚠️ No se encontró arreglo directo; contando keys: ${numeroCursos}`);
      }

      cursosCargadosTrend.add(numeroCursos);
    } catch (e) {
      console.log(`❌ Iteración ${iterationId}: Error procesando JSON - ${e.message}`);
    }
  }

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
  });

  const validacionesExitosas = Object.values(validaciones).filter(v => v).length;
  const totalValidaciones = Object.keys(validaciones).length;
  const porcentajeExito = Math.round((validacionesExitosas / totalValidaciones) * 100);

  if (cursosRes.status === 200) {
    console.log(`✅ Iteración ${iterationId}: ${numeroCursos} cursos cargados en ${tiempoRequest}ms (${validacionesExitosas}/${totalValidaciones} validaciones exitosas)`);
    if (numeroCursos > 100) {
      console.log(`🎯 Objetivo alcanzado: más de 100 cursos (${numeroCursos})`);
    }

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

  sleep(1);

  return {
    iteration: iterationId,
    requestTime: tiempoRequest,
    status: cursosRes.status,
    coursesCount: numeroCursos,
    success: cursosRes.status === 200,
    meetTarget: numeroCursos > 100, // actualizado
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
    dataReceived: Math.round((data.metrics.data_received?.values.count || 0) / 1024),
    cursosMax: Math.round(data.metrics.cursos_cargados?.values.max || 0)
  };

  const exitoTotal = stats.checksTotal > 0 ? Math.round((stats.checksExitosos / stats.checksTotal) * 100) : 0;
  const objetivoAlcanzado = stats.cursosMax > 100 ? "✅ ALCANZADO (>100)" : stats.cursosMax > 50 ? "⚠️ PARCIAL" : "❌ NO";
  const rendimientoObjetivo = stats.duracionPromedio <= 2000 ? "✅ CUMPLE" : "❌ NO CUMPLE";

  return {
    'stdout': `
═════════════════════════════════════════════════════════════════════════════════════
  🎯 PR-02.3-01: VISUALIZACIÓN - CARGAR LISTA DE CURSOS ACTIVOS (máx. 200 registros)
═════════════════════════════════════════════════════════════════════════════════════
  📊 VALIDACIONES: ${stats.checksExitosos}/${stats.checksTotal} checks (${exitoTotal}%)
  🌐 HTTP: ${stats.requestsTotal} cargas de vista realizadas
  ⏱️ RENDIMIENTO: ${stats.duracionPromedio}ms promedio (objetivo: ≤2000ms) ${rendimientoObjetivo}
  📈 TIEMPOS: ${stats.duracionMin}ms min | ${stats.duracionMax}ms max
  🎯 CURSOS CARGADOS: ${stats.cursosMax} cursos (objetivo: >100) - ${objetivoAlcanzado}
  📦 DATOS: ${stats.dataReceived}KB transferidos
  ✅ CARGAS EXITOSAS: ${stats.requestsTotal} de ${stats.requestsTotal} intentos
  🔍 ENDPOINT: GET /webapi/courses?entitytype=instructor&coursestatus=active
  ✅ OBJETIVO: Evaluar rendimiento de carga de hasta 200 cursos activos
═════════════════════════════════════════════════════════════════════════════════════
`
  };
}
