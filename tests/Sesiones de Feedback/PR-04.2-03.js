import http from 'k6/http';
import { check } from 'k6';
import { getHeadersWithCSRF } from '../login_token.js';

export const options = {
  vus: 1,
  iterations: 1,
  thresholds: {
    'http_req_duration': ['p(95)<4000'], // Acción ≤ 4s por sesión
    'checks': ['rate>0.95']
  },
  tags: {
    modulo: 'Sesiones de Feedback',
  },
};

export default function () {
  console.log('🚀 PR-04.2-03: Restaurar 100 Sesiones Eliminadas Individualmente');
  
  const headers = getHeadersWithCSRF();
  const cursoObjetivo = 'TESTID'; // Cambiar por el ID de tu curso

  // 📥 Obtener sesiones visibles activas EN la papelera
  const getUrl = 'https://teammates-orugas.appspot.com/webapi/sessions?entitytype=instructor&isinrecyclebin=true';
  const res = http.get(getUrl, { headers });

  check(res, {
    '✅ PR-04.2-03: Consulta de sesiones papelera - Status 200': r => r.status === 200,
    '✅ PR-04.2-03: Tiempo de consulta ≤ 2s': r => r.timings.duration <= 2000,
  });

  if (res.status !== 200) {
    console.log('❌ Error al obtener sesiones en papelera');
    return;
  }

  let sesiones = [];
  try {
    const data = JSON.parse(res.body);
    sesiones = data.feedbackSessions || data.sessions || data || [];
  } catch (e) {
    console.log('❌ Error al parsear respuesta de sesiones en papelera');
    return;
  }

  console.log(`📊 Total de sesiones en papelera: ${sesiones.length}`);

  // 📌 Filtrar sesiones del curso con permiso de modificación
  const sesionesFiltradas = sesiones.filter(s =>
    s.courseId === cursoObjetivo && s.privileges?.canModifySession
  );

  // Limitar a máximo 100 sesiones según el requisito
  const sesionesARestaurar = sesionesFiltradas.slice(0, 100);
  console.log(`🎯 Sesiones a restaurar: ${sesionesARestaurar.length} de ${sesionesFiltradas.length} disponibles`);

  if (sesionesARestaurar.length === 0) {
    console.log('⚠️ No se encontraron sesiones del curso en papelera con permisos de modificación');
    return;
  }

  let exitosas = 0, fallidas = 0;
  const startTime = Date.now();

  for (let i = 0; i < sesionesARestaurar.length; i++) {
    const sesion = sesionesARestaurar[i];
    const fsnameEncoded = encodeURIComponent(sesion.feedbackSessionName);
    const url = `https://teammates-orugas.appspot.com/webapi/bin/session?courseid=${cursoObjetivo}&fsname=${fsnameEncoded}`;

    const delStartTime = Date.now();
    const delRes = http.del(url, null, { headers });
    const delTime = Date.now() - delStartTime;

    const success = check(delRes, {
      '✅ PR-04.2-03: Restauración - Status OK': r => r.status === 200 || r.status === 204,
      '✅ PR-04.2-03: Tiempo ≤ 4s': r => delTime <= 4000,
    });

    if (success) {
      exitosas++;
      console.log(`✅ Sesión ${i + 1}/${sesionesARestaurar.length}: "${sesion.feedbackSessionName}" restaurada | ${delTime}ms`);
    } else {
      fallidas++;
      console.log(`❌ Error sesión ${i + 1}: "${sesion.feedbackSessionName}" | Status ${delRes.status} | ${delTime}ms`);
    }

    // Progreso cada 20 sesiones
    if ((i + 1) % 20 === 0 || (i + 1) === sesionesARestaurar.length) {
      console.log(`� Progreso: ${i + 1}/${sesionesARestaurar.length} sesiones procesadas`);
    }
  }

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`🏁 Proceso completado: ${exitosas} éxitos, ${fallidas} errores en ${totalTime}s`);

  // Validaciones finales
  check({ exitosas, fallidas, total: sesionesARestaurar.length }, {
    '✅ PR-04.2-03: Sesiones restauradas': (d) => d.exitosas > 0,
    '✅ PR-04.2-03: Sin errores críticos': (d) => (d.fallidas / d.total) < 0.05,
    '✅ PR-04.2-03: Proceso completado': (d) => (d.exitosas + d.fallidas) === d.total,
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
  🎯 PR-04.2-03: ACCIÓN MASIVA - RESTAURAR SESIONES ELIMINADAS INDIVIDUALMENTE
═══════════════════════════════════════════════════════════════════════════════
  📊 RESUMEN: ${stats.checksExitosos}/${stats.checksTotal} checks (${exitoTotal}%)
  🌐 HTTP: ${stats.requestsTotal} requests, ${stats.requestsFallidos}% fallidos, ${stats.duracionPromedio}ms promedio
  ⏱️ TIEMPO: ${stats.tiempoTotal}s total, ${stats.iteraciones} iteraciones
  🎯 OBJETIVO: Evaluar consistencia de restauraciones múltiples
═══════════════════════════════════════════════════════════════════════════════
`
  };
}
