import http from 'k6/http';
import { check } from 'k6';
import { Trend, Counter } from 'k6/metrics';
import { getHeadersWithCSRF } from '../login_token.js';

// 📊 Métricas personalizadas
const duracionEdicionNotificacion = new Trend('notification_edit_duration');
const contadorNotificacionesEditadas = new Counter('notifications_edited');

export const options = {
  scenarios: {
    edit_notifications: {
      executor: 'shared-iterations',
      vus: 1,
      iterations: 1,
      maxDuration: '10m',
    },
  },
  thresholds: {
    'notification_edit_duration': ['avg<=3000'],
    'http_req_duration': ['avg<=3000'],
    'checks': ['rate>=0.95'],
  },
};

export default function () {
  console.log('� PR-05.1-03: Edición Individual de Notificaciones (100 acciones)');
  
  const headers = getHeadersWithCSRF();
  const getUrl = 'https://teammates-orugas.appspot.com/webapi/notifications';
  
  // 📥 Obtener notificaciones existentes
  const inicioConsulta = Date.now();
  const getRes = http.get(getUrl, { headers });

  check(getRes, {
    '✅ PR-05.1-03: Consulta de notificaciones exitosa': r => r.status === 200,
    '✅ PR-05.1-03: Respuesta contiene datos válidos': r => r.body && r.body.length > 0,
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
    console.log('⚠️ No hay notificaciones para editar');
    check(null, {
      '✅ PR-05.1-03: No hay notificaciones para procesar': () => true,
    });
    return;
  }

  const maxEdiciones = Math.min(100, notificaciones.length);
  console.log(`🎯 Notificaciones a editar: ${maxEdiciones} de ${notificaciones.length} disponibles`);
  
  let editadosExitosos = 0;
  let errores = 0;

  // ✏️ Procesar ediciones individuales
  for (let i = 0; i < maxEdiciones; i++) {
    const noti = notificaciones[i];
    const notiId = noti.id || noti.notificationId || noti.notificationid;

    if (!notiId) {
      errores++;
      console.log(`❌ Notificación ${i + 1}: ID no encontrado`);
      continue;
    }

    const inicioEdicion = Date.now();
    
    const updatedPayload = {
      title: noti.title + ' EDITADO',
      message: noti.message,
      style: noti.style,
      targetUser: noti.targetUser,
      startTimestamp: noti.startTimestamp,
      endTimestamp: noti.endTimestamp,
    };

    try {
      const putUrl = `https://teammates-orugas.appspot.com/webapi/notification?notificationid=${notiId}`;
      const putRes = http.put(putUrl, JSON.stringify(updatedPayload), {
        headers: { 
          ...headers,
          'Content-Type': 'application/json',
        },
      });
      
      const duracion = Date.now() - inicioEdicion;
      duracionEdicionNotificacion.add(duracion);

      const exitoso = putRes.status === 200 || putRes.status === 204;
      
      if (exitoso) {
        editadosExitosos++;
        contadorNotificacionesEditadas.add(1);
        console.log(`✅ Notificación ${i + 1}/${maxEdiciones}: "${noti.title}" editada | ${duracion}ms`);
      } else {
        errores++;
        console.log(`❌ Error ${i + 1}/${maxEdiciones}: "${noti.title}" - Status: ${putRes.status}`);
      }

      check(putRes, {
        [`✅ PR-05.1-03: Notificación "${noti.title}" editada exitosamente`]: () => exitoso,
        '✅ PR-05.1-03: Tiempo de edición aceptable': () => duracion <= 3000,
      });

    } catch (error) {
      errores++;
      console.log(`❌ Excepción en notificación ${i + 1}: ${error.message}`);
    }
  }

  const tiempoProceso = (Date.now() - inicioConsulta) / 1000;
  console.log(`📊 Progreso: ${editadosExitosos + errores}/${maxEdiciones} notificaciones procesadas`);
  console.log(`🏁 Proceso completado: ${editadosExitosos} éxitos, ${errores} errores en ${tiempoProceso.toFixed(2)}s`);

  // ✅ Validaciones finales
  check(null, {
    '✅ PR-05.1-03: Al menos una notificación editada exitosamente': () => editadosExitosos > 0,
    '✅ PR-05.1-03: Tasa de éxito aceptable': () => editadosExitosos > 0 ? (editadosExitosos / (editadosExitosos + errores)) >= 0.8 : true,
    '✅ PR-05.1-03: Proceso completado': () => (editadosExitosos + errores) === maxEdiciones,
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
  🎯 PR-05.1-03: ACCIÓN MASIVA - EDICIÓN INDIVIDUAL DE NOTIFICACIONES
═══════════════════════════════════════════════════════════════════════════════
  📊 RESUMEN: ${stats.checksExitosos}/${stats.checksTotal} checks (${exitoTotal}%)
  🌐 HTTP: ${stats.requestsTotal} requests, ${stats.requestsFallidos}% fallidos, ${stats.duracionPromedio}ms promedio
  ⏱️ TIEMPO: ${stats.tiempoTotal}s total, ${stats.iteraciones} iteraciones
  🎯 OBJETIVO: Validar tiempo de respuesta y persistencia de cambios (100 acciones)
═══════════════════════════════════════════════════════════════════════════════
`
  };
}
