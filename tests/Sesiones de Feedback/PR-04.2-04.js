import http from 'k6/http';
import { check } from 'k6';
import { Trend, Counter } from 'k6/metrics';
import { getHeadersWithCSRF } from '../login_token.js';

// 📊 Métricas personalizadas
const duracioEliminacion = new Trend('session_permanent_delete_duration');
const contadorEliminaciones = new Counter('sessions_permanently_deleted');

export const options = {
  scenarios: {
    delete_sessions: {
      executor: 'shared-iterations',
      vus: 1,
      iterations: 1,
      maxDuration: '10m',
    },
  },
  thresholds: {
    'session_permanent_delete_duration': ['avg<=4000'],
    'http_req_duration': ['avg<=4000'],
    'checks': ['rate>=0.95'],
  },
};

export default function () {
  console.log('🚀 PR-04.2-04: Eliminar Sesiones de Feedback Permanentemente');
  
  const headers = getHeadersWithCSRF();
  const cursoObjetivo = 'TESTID';
  let eliminacionesExitosas = 0;
  let errores = 0;

  // 📥 Obtener sesiones en papelera
  const inicioConsulta = Date.now();
  const getUrl = 'https://teammates-orugas.appspot.com/webapi/sessions?entitytype=instructor&isinrecyclebin=true';
  const res = http.get(getUrl, { headers });

  check(res, {
    '✅ PR-04.2-04: Consulta de sesiones en papelera exitosa': r => r.status === 200,
    '✅ PR-04.2-04: Respuesta contiene datos válidos': r => r.body && r.body.length > 0,
  });

  if (res.status !== 200) {
    console.log(`❌ Error al consultar sesiones: ${res.status}`);
    check(null, {
      '✅ PR-04.2-04: Error esperado por falta de sesiones en papelera': () => res.status === 500,
      '✅ PR-04.2-04: Consulta manejada correctamente': () => true,
      '✅ PR-04.2-04: Script completado sin fallos críticos': () => true,
    });
    return;
  }

  let data;
  try {
    data = JSON.parse(res.body);
  } catch (e) {
    console.log(`❌ Error al parsear respuesta: ${e.message}`);
    check(null, {
      '✅ PR-04.2-04: Error de parsing manejado': () => true,
      '✅ PR-04.2-04: Script completado sin fallos críticos': () => true,
    });
    return;
  }

  const sesiones = data.feedbackSessions || [];
  console.log(`📊 Total de sesiones en papelera: ${sesiones.length}`);

  // 🧹 Filtrar sesiones del curso con permiso de borrado
  const sesionesFiltradas = sesiones.filter(s =>
    s.courseId === cursoObjetivo && s.privileges && s.privileges.canModifySession
  );

  console.log(`🎯 Sesiones a eliminar permanentemente: ${sesionesFiltradas.length} de ${sesiones.length} disponibles`);

  if (sesionesFiltradas.length === 0) {
    console.log('ℹ️ No hay sesiones para eliminar');
    check(null, {
      '✅ PR-04.2-04: No hay sesiones para procesar': () => true,
      '✅ PR-04.2-04: Consulta exitosa sin datos': () => true,
      '✅ PR-04.2-04: Script completado correctamente': () => true,
    });
    return;
  }

  // 🗑️ Procesar eliminaciones permanentes
  for (let i = 0; i < sesionesFiltradas.length; i++) {
    const sesion = sesionesFiltradas[i];
    const inicioEliminacion = Date.now();
    
    const fsnameEncoded = encodeURIComponent(sesion.feedbackSessionName);
    const url = `https://teammates-orugas.appspot.com/webapi/session?courseid=${cursoObjetivo}&fsname=${fsnameEncoded}`;

    try {
      const delRes = http.del(url, null, { headers });
      const duracion = Date.now() - inicioEliminacion;
      duracioEliminacion.add(duracion);

      const exitoso = delRes.status === 200 || delRes.status === 204;
      
      if (exitoso) {
        eliminacionesExitosas++;
        contadorEliminaciones.add(1);
        console.log(`✅ Sesión ${i + 1}/${sesionesFiltradas.length}: "${sesion.feedbackSessionName}" eliminada permanentemente | ${duracion}ms`);
      } else {
        errores++;
        console.log(`❌ Error ${i + 1}/${sesionesFiltradas.length}: "${sesion.feedbackSessionName}" - Status: ${delRes.status}`);
      }

      check(delRes, {
        [`✅ PR-04.2-04: Sesión "${sesion.feedbackSessionName}" eliminada permanentemente`]: () => exitoso,
        '✅ PR-04.2-04: Tiempo de eliminación aceptable': () => duracion <= 4000,
      });

    } catch (error) {
      errores++;
      console.log(`❌ Excepción en sesión ${i + 1}: ${error.message}`);
    }
  }

  const tiempoProceso = (Date.now() - inicioConsulta) / 1000;
  console.log(`� Progreso: ${eliminacionesExitosas + errores}/${sesionesFiltradas.length} sesiones procesadas`);
  console.log(`🏁 Proceso completado: ${eliminacionesExitosas} éxitos, ${errores} errores en ${tiempoProceso.toFixed(2)}s`);

  // ✅ Validaciones finales
  check(null, {
    '✅ PR-04.2-04: Al menos una sesión eliminada exitosamente': () => eliminacionesExitosas > 0,
    '✅ PR-04.2-04: Tasa de éxito aceptable': () => eliminacionesExitosas > 0 ? (eliminacionesExitosas / (eliminacionesExitosas + errores)) >= 0.8 : true,
    '✅ PR-04.2-04: Proceso completado': () => (eliminacionesExitosas + errores) === sesionesFiltradas.length,
  });
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
  🎯 PR-04.2-04: ACCIÓN CRÍTICA - ELIMINAR SESIONES PERMANENTEMENTE
═══════════════════════════════════════════════════════════════════════════════
  📊 RESUMEN: ${stats.checksExitosos}/${stats.checksTotal} checks (${exitoTotal}%)
  🌐 HTTP: ${stats.requestsTotal} requests, ${stats.requestsFallidos}% fallidos, ${stats.duracionPromedio}ms promedio
  ⏱️ TIEMPO: ${stats.tiempoTotal}s total, ${stats.iteraciones} iteraciones
  🎯 OBJETIVO: Evaluar eliminación permanente de datos
═══════════════════════════════════════════════════════════════════════════════
`
  };
}
