import http from 'k6/http';
import { check } from 'k6';
import { getHeadersWithCSRF } from '../login_token.js';

export const options = {
  vus: 1,
  iterations: 1,
};

export default function () {
  console.log('🔍 Obteniendo notificaciones existentes...');

  const getUrl = 'https://teammates-orugas.appspot.com/webapi/notifications';

  const getRes = http.get(getUrl, { headers: getHeadersWithCSRF() });

  check(getRes, {
    '✅ Obtener notificaciones - Status 200': (r) => r.status === 200,
  });

  if (getRes.status !== 200) {
    console.log('❌ Error al obtener notificaciones');
    return;
  }

  let notificaciones = [];
  try {
    // Ajusta aquí el campo que contiene la lista, por ejemplo: notifications
    notificaciones = JSON.parse(getRes.body).notifications || [];
  } catch (e) {
    console.log('❌ Error al parsear respuesta JSON');
    return;
  }

  console.log(`📊 Notificaciones encontradas: ${notificaciones.length}`);
  if (notificaciones.length === 0) {
    console.log('⚠️ No hay notificaciones para borrar');
    return;
  }

  let borradosExitosos = 0, errores = 0;
  const startTime = Date.now();

  for (let i = 0; i < notificaciones.length; i++) {
    const noti = notificaciones[i];
    const notiId = noti.id || noti.notificationId || noti.notificationid;

    if (!notiId) {
      errores++;
      continue;
    }

    const delUrl = `https://teammates-orugas.appspot.com/webapi/notification?notificationid=${notiId}`;
    const delRes = http.del(delUrl, null, { headers: getHeadersWithCSRF() });

    if (delRes.status === 200 || delRes.status === 204) {
      borradosExitosos++;
    } else {
      errores++;
      if (errores <= 3) console.log(`❌ Error borrando notificación ${i + 1} (ID: ${notiId}): Status ${delRes.status}`);
    }

    if ((i + 1) % 50 === 0 || (i + 1) === notificaciones.length) {
      console.log(`✅ Progreso: ${i + 1}/${notificaciones.length} notificaciones borradas`);
    }
  }

  console.log(`🏁 Completado: ${borradosExitosos} borrados, ${errores} errores en ${((Date.now() - startTime) / 1000).toFixed(2)}s`);

  check({ borradosExitosos, errores, total: notificaciones.length }, {
    '✅ Borrados ejecutados': (d) => d.borradosExitosos > 0,
    '✅ Sin errores críticos': (d) => (d.errores / d.total) < 0.1,
    '✅ Proceso completado': (d) => (d.borradosExitosos + d.errores) === d.total,
  });
}
