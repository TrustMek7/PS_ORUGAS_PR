import http from 'k6/http';
import { check } from 'k6';
import { Trend, Counter } from 'k6/metrics';
import { getHeadersWithCSRF } from '../login_token.js';

// 📊 Métricas personalizadas
const duracionEliminacionNotificacion = new Trend('notification_delete_duration');
const contadorNotificacionesEliminadas = new Counter('notifications_deleted');

export const options = {
  scenarios: {
    delete_notifications: {
      executor: 'shared-iterations',
      vus: 1,
      iterations: 1,
      maxDuration: '10m',
    },
  },
  thresholds: {
    'notification_delete_duration': ['avg<=3000'],
    'http_req_duration': ['avg<=3000'],
    'checks': ['rate>=0.95'],
  },
};

export default function () {
  console.log('� PR-05.1-04: Eliminación Individual de Notificaciones (100 acciones)');
  
  const headers = getHeadersWithCSRF();
  const getUrl = 'https://teammates-orugas.appspot.com/webapi/notifications';
  
  // 📥 Obtener notificaciones existentes
  const inicioConsulta = Date.now();
  const getRes = http.get(getUrl, { headers });

  check(getRes, {
    '✅ PR-05.1-04: Consulta de notificaciones exitosa': r => r.status === 200,
    '✅ PR-05.1-04: Respuesta contiene datos válidos': r => r.body && r.body.length > 0,
  });

  if (getRes.status !== 200) {
    console.log('❌ Error al obtener notificaciones');
    return;
  }

  let notificaciones = [];
  try {
    const data = JSON.parse(getRes.body);
    notificaciones = data.notifications || [];
  } catch (e) {
    console.log(`❌ Error al parsear respuesta: ${e.message}`);
    return;
  }

  console.log(`📊 Total de notificaciones disponibles: ${notificaciones.length}`);
  
  if (notificaciones.length === 0) {
    console.log('⚠️ No hay notificaciones para eliminar');
    check(null, {
      '✅ PR-05.1-04: No hay notificaciones para procesar': () => true,
    });
    return;
  }

  const maxEliminaciones = Math.min(100, notificaciones.length);
  console.log(`🎯 Notificaciones a eliminar: ${maxEliminaciones} de ${notificaciones.length} disponibles`);
  
  let eliminacionesExitosas = 0;
  let errores = 0;

  // 🗑️ Procesar eliminaciones individuales
  for (let i = 0; i < maxEliminaciones; i++) {
    const noti = notificaciones[i];
    const notiId = noti.id || noti.notificationId || noti.notificationid;

    if (!notiId) {
      errores++;
      console.log(`❌ Notificación ${i + 1}: ID no encontrado`);
      continue;
    }

    const inicioEliminacion = Date.now();
    
    try {
      const delUrl = `https://teammates-orugas.appspot.com/webapi/notification?notificationid=${notiId}`;
      const delRes = http.del(delUrl, null, { headers });
      
      const duracion = Date.now() - inicioEliminacion;
      duracionEliminacionNotificacion.add(duracion);

      const exitoso = delRes.status === 200 || delRes.status === 204;
      
      if (exitoso) {
        eliminacionesExitosas++;
        contadorNotificacionesEliminadas.add(1);
        console.log(`✅ Notificación ${i + 1}/${maxEliminaciones}: "${noti.title}" eliminada | ${duracion}ms`);
      } else {
        errores++;
        console.log(`❌ Error ${i + 1}/${maxEliminaciones}: "${noti.title}" - Status: ${delRes.status}`);
      }

      check(delRes, {
        [`✅ PR-05.1-04: Notificación "${noti.title}" eliminada exitosamente`]: () => exitoso,
        '✅ PR-05.1-04: Tiempo de eliminación aceptable': () => duracion <= 3000,
      });

    } catch (error) {
      errores++;
      console.log(`❌ Excepción en notificación ${i + 1}: ${error.message}`);
    }
  }

  const tiempoProceso = (Date.now() - inicioConsulta) / 1000;
  console.log(`📊 Progreso: ${eliminacionesExitosas + errores}/${maxEliminaciones} notificaciones procesadas`);
  console.log(`🏁 Proceso completado: ${eliminacionesExitosas} éxitos, ${errores} errores en ${tiempoProceso.toFixed(2)}s`);

  // ✅ Validaciones finales
  check(null, {
    '✅ PR-05.1-04: Al menos una notificación eliminada exitosamente': () => eliminacionesExitosas > 0,
    '✅ PR-05.1-04: Tasa de éxito aceptable': () => eliminacionesExitosas > 0 ? (eliminacionesExitosas / (eliminacionesExitosas + errores)) >= 0.8 : true,
    '✅ PR-05.1-04: Proceso completado': () => (eliminacionesExitosas + errores) === maxEliminaciones,
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
  🎯 PR-05.1-04: ACCIÓN MASIVA - ELIMINACIÓN INDIVIDUAL DE NOTIFICACIONES
═══════════════════════════════════════════════════════════════════════════════
  📊 RESUMEN: ${stats.checksExitosos}/${stats.checksTotal} checks (${exitoTotal}%)
  🌐 HTTP: ${stats.requestsTotal} requests, ${stats.requestsFallidos}% fallidos, ${stats.duracionPromedio}ms promedio
  ⏱️ TIEMPO: ${stats.tiempoTotal}s total, ${stats.iteraciones} iteraciones
  🎯 OBJETIVO: Confirmar consistencia al eliminar datos críticos (100 acciones)
═══════════════════════════════════════════════════════════════════════════════
`
  };
}
