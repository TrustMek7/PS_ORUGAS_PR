import http from 'k6/http';
import { check } from 'k6';
import { getHeadersWithCSRF } from '../login_token.js';

export const options = {
  vus: 1,
  iterations: 1,
  thresholds: {
    'http_req_duration': ['p(95)<1000'], // Tiempo promedio ≤ 1s
    'checks': ['rate>0.95']
  }
};

export default function () {
  console.log('🚀 PR-04.2-01: Enviar 500 Sesiones de Feedback a la Papelera');
  
  const headers = getHeadersWithCSRF();
  const cursoObjetivo = 'TESTID'; // Cambiar por el ID del curso deseado

  // 📥 Obtener todas las sesiones NO en papelera
  const getUrl = 'https://teammates-orugas.appspot.com/webapi/sessions?entitytype=instructor&isinrecyclebin=false';
  const res = http.get(getUrl, { headers });

  check(res, {
    '✅ PR-04.2-01: Consulta de sesiones - Status 200': r => r.status === 200,
    '✅ PR-04.2-01: Tiempo de consulta ≤ 2s': r => r.timings.duration <= 2000,
  });

  if (res.status !== 200) {
    console.log('❌ Error al obtener sesiones activas');
    return;
  }

  let sesiones = [];
  try {
    const data = JSON.parse(res.body);
    sesiones = data.feedbackSessions || data.sessions || data || [];
  } catch (e) {
    console.log('❌ Error al parsear respuesta de sesiones');
    return;
  }

  console.log(`📊 Total de sesiones encontradas: ${sesiones.length}`);

  // 📌 Filtrar sesiones del curso con permiso de modificación
  const sesionesFiltradas = sesiones.filter(s =>
    s.courseId === cursoObjetivo && s.privileges?.canModifySession
  );

  // Limitar a máximo 500 sesiones según el requisito
  const sesionesAProcesar = sesionesFiltradas.slice(0, 500);
  console.log(`🎯 Sesiones a enviar a papelera: ${sesionesAProcesar.length} de ${sesionesFiltradas.length} disponibles`);

  if (sesionesAProcesar.length === 0) {
    console.log('⚠️ No se encontraron sesiones del curso con permisos de modificación');
    return;
  }

  let exitosas = 0, fallidas = 0;
  const startTime = Date.now();

  for (let i = 0; i < sesionesAProcesar.length; i++) {
    const sesion = sesionesAProcesar[i];
    const fsnameEncoded = encodeURIComponent(sesion.feedbackSessionName);
    const url = `https://teammates-orugas.appspot.com/webapi/bin/session?courseid=${cursoObjetivo}&fsname=${fsnameEncoded}`;

    const putStartTime = Date.now();
    const putRes = http.put(url, null, { headers });
    const putTime = Date.now() - putStartTime;

    const success = check(putRes, {
      '✅ PR-04.2-01: Envío a papelera - Status OK': r => r.status === 200 || r.status === 204,
      '✅ PR-04.2-01: Tiempo ≤ 1s': r => putTime <= 1000,
    });

    if (success) {
      exitosas++;
      console.log(`✅ Sesión ${i + 1}/${sesionesAProcesar.length}: "${sesion.feedbackSessionName}" | ${putTime}ms`);
    } else {
      fallidas++;
      console.log(`❌ Error sesión ${i + 1}: "${sesion.feedbackSessionName}" | Status ${putRes.status} | ${putTime}ms`);
    }

    // Progreso cada 50 sesiones
    if ((i + 1) % 50 === 0 || (i + 1) === sesionesAProcesar.length) {
      console.log(`� Progreso: ${i + 1}/${sesionesAProcesar.length} sesiones procesadas`);
    }
  }

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`🏁 Proceso completado: ${exitosas} éxitos, ${fallidas} errores en ${totalTime}s`);

  // Validaciones finales
  check({ exitosas, fallidas, total: sesionesAProcesar.length }, {
    '✅ PR-04.2-01: Sesiones enviadas a papelera': (d) => d.exitosas > 0,
    '✅ PR-04.2-01: Sin errores críticos': (d) => (d.fallidas / d.total) < 0.05,
    '✅ PR-04.2-01: Proceso completado': (d) => (d.exitosas + d.fallidas) === d.total,
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
  🎯 PR-04.2-01: FUNCIONALIDAD - ENVIAR 500 SESIONES DE FEEDBACK A LA PAPELERA
═══════════════════════════════════════════════════════════════════════════════
  📊 RESUMEN: ${stats.checksExitosos}/${stats.checksTotal} checks (${exitoTotal}%)
  🌐 HTTP: ${stats.requestsTotal} requests, ${stats.requestsFallidos}% fallidos, ${stats.duracionPromedio}ms promedio
  ⏱️ TIEMPO: ${stats.tiempoTotal}s total, ${stats.iteraciones} iteraciones
  🎯 OBJETIVO: Evaluar estabilidad y tiempo de respuesta en operaciones masivas
═══════════════════════════════════════════════════════════════════════════════
`
  };
}
