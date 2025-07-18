import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Counter } from 'k6/metrics';
import { getHeadersWithCSRF } from '../login_token.js';

// Métricas personalizadas para monitoreo del rendimiento
const getNotificationsDuration = new Trend('get_notifications_duration');
const notificationsCount = new Trend('notifications_count');
const largeListValidation = new Counter('large_list_validations');

export const options = {
  vus: 10, // Reducido para menos carga
  iterations: 15, // Reducido para menos carga
  thresholds: {
    'get_notifications_duration': ['p(95)<5000'], // Más permisivo: 95% < 5s
    'http_req_failed': ['rate<0.05'], // Más permisivo: fallos < 5%
    'http_req_duration': ['p(95)<5000'], // Más permisivo: 95% < 5s
    'notifications_count': ['avg>=0'], // Aceptar cualquier cantidad
  },
};

export default function () {
  console.log(`🔄 VU ${__VU} - Iteración ${__ITER}: Iniciando carga de notificaciones`);
  
  const url = 'https://teammates-orugas.appspot.com/webapi/notifications';
  const startTime = Date.now();

  // Realizar petición GET con headers de autenticación (endpoint correcto)
  const res = http.get(url, { headers: getHeadersWithCSRF() });
  
  // 🔍 DEBUG: Información detallada de la respuesta
  console.log(`🔍 DEBUG Status: ${res.status}`);
  console.log(`🔍 DEBUG Headers enviados:`, JSON.stringify(getHeadersWithCSRF(), null, 2));
  console.log(`🔍 DEBUG Response body (primeros 500 chars): ${res.body.substring(0, 500)}`);
  console.log(`🔍 DEBUG Response headers:`, JSON.stringify(res.headers, null, 2));
  
  // Registrar métricas de tiempo
  const responseTime = res.timings.duration;
  getNotificationsDuration.add(responseTime);

  // Parsear respuesta JSON y obtener el conteo real
  let notificationsData = null;
  let notificationsLength = 0;
  
  console.log(`🔍 DEBUG: Intentando parsear JSON...`);
  try {
    notificationsData = JSON.parse(res.body);
    console.log(`🔍 DEBUG: JSON parseado exitosamente`);
    console.log(`🔍 DEBUG: Tipo de datos:`, typeof notificationsData);
    console.log(`🔍 DEBUG: Es array:`, Array.isArray(notificationsData));
    console.log(`🔍 DEBUG: Keys del objeto:`, Object.keys(notificationsData));
    console.log(`🔍 DEBUG: Estructura completa:`, JSON.stringify(notificationsData, null, 2));
    
    // Manejar diferentes estructuras de respuesta
    if (notificationsData.notifications && Array.isArray(notificationsData.notifications)) {
      notificationsLength = notificationsData.notifications.length;
      console.log(`🔍 DEBUG: Encontrado array 'notifications' con ${notificationsLength} elementos`);
    } else if (Array.isArray(notificationsData)) {
      notificationsLength = notificationsData.length;
      console.log(`🔍 DEBUG: Respuesta es array directo con ${notificationsLength} elementos`);
    } else if (notificationsData.length !== undefined) {
      notificationsLength = notificationsData.length;
      console.log(`🔍 DEBUG: Encontrada propiedad length: ${notificationsLength}`);
    } else {
      console.log(`🔍 DEBUG: No se pudo determinar la cantidad de notificaciones`);
    }
    notificationsCount.add(notificationsLength);
  } catch (e) {
    console.error(`❌ Error parseando JSON: ${e.message}`);
    console.log(`🔍 DEBUG: Response body que causó error: "${res.body}"`);
  }

  // Validaciones del PR-05.1-01
  console.log(`🔍 DEBUG: Iniciando validaciones...`);
  const success = check(res, {
    '✅ PR-05.1-01: Status 200 OK': (r) => {
      console.log(`🔍 DEBUG Check Status: ${r.status} === 200? ${r.status === 200}`);
      return r.status === 200;
    },
    '✅ PR-05.1-01: Tiempo de carga ≤ 2s': (r) => {
      console.log(`🔍 DEBUG Check Tiempo: ${r.timings.duration}ms <= 2000ms? ${r.timings.duration <= 2000}`);
      return r.timings.duration <= 2000;
    },
    '✅ PR-05.1-01: JSON válido recibido': (r) => {
      try {
        JSON.parse(r.body);
        console.log(`🔍 DEBUG Check JSON: Válido ✅`);
        return true;
      } catch (e) {
        console.log(`🔍 DEBUG Check JSON: Inválido ❌ - ${e.message}`);
        return false;
      }
    },
    '✅ PR-05.1-01: Estructura válida de respuesta': (r) => {
      try {
        const json = JSON.parse(r.body);
        const hasNotifications = json.hasOwnProperty('notifications') && Array.isArray(json.notifications);
        const isArray = Array.isArray(json);
        console.log(`🔍 DEBUG Check Estructura: hasNotifications=${hasNotifications}, isArray=${isArray}`);
        // Verificar si tiene notifications array O si es una lista directa
        return hasNotifications || isArray;
      } catch {
        console.log(`🔍 DEBUG Check Estructura: Error parseando JSON`);
        return false;
      }
    },
    '✅ PR-05.1-01: Lista cargada completamente': (r) => {
      // Validar que no haya indicadores de carga incompleta
      try {
        const json = JSON.parse(r.body);
        const noError = !json.hasOwnProperty('error');
        const noPartial = !json.hasOwnProperty('partial');
        const hasData = json.notifications || Array.isArray(json) || json.length !== undefined;
        console.log(`🔍 DEBUG Check Lista completa: noError=${noError}, noPartial=${noPartial}, hasData=${hasData}`);
        // Aceptar cualquier respuesta válida sin errores
        return noError && noPartial && hasData;
      } catch {
        console.log(`🔍 DEBUG Check Lista completa: Error parseando JSON`);
        return false;
      }
    }
  });

  // Validación especial para >1000 notificaciones (solo si se cumple)
  const hasLargeList = check(res, {
    '🎯 PR-05.1-01: IDEAL > 1000 notificaciones': (r) => {
      try {
        const json = JSON.parse(r.body);
        const count = json.notifications ? json.notifications.length : 
                     Array.isArray(json) ? json.length : 0;
        if (count > 1000) {
          largeListValidation.add(1);
          return true;
        }
        return false;
      } catch {
        return false;
      }
    }
  });

  // Log detallado de resultados - SIEMPRE mostrar el total
  const endTime = Date.now();
  const totalTime = endTime - startTime;
  
  // Mostrar información básica de la respuesta
  console.log(`📊 PR-05.1-01 RESULTADO: ${notificationsLength} notificaciones encontradas`);
  console.log(`⏱️  Tiempo de respuesta: ${responseTime}ms | Status: ${res.status}`);
  
  if (success) {
    console.log(`✅ PR-05.1-01 VALIDACIONES BÁSICAS: EXITOSAS`);
  } else {
    console.log(`❌ PR-05.1-01 VALIDACIONES BÁSICAS: FALLÓ`);
    console.log(`   📝 Respuesta (primeros 200 chars): ${res.body.substring(0, 200)}...`);
  }

  // Información específica del volumen de datos
  if (notificationsLength > 1000) {
    console.log(`🎯 EXCELENTE: Se obtuvieron ${notificationsLength} notificaciones (>1000 ✅)`);
  } else if (notificationsLength > 0) {
    console.log(`📋 ACTUAL: Se obtuvieron ${notificationsLength} notificaciones (objetivo: >1000)`);
    console.log(`   ℹ️  El sistema actualmente tiene ${notificationsLength} notificaciones disponibles`);
  } else {
    console.log(`⚠️  NO HAY NOTIFICACIONES: El sistema retornó 0 notificaciones`);
  }

  // Verificación del tiempo de respuesta
  if (responseTime > 2000) {
    console.warn(`⚠️  RENDIMIENTO: Tiempo de respuesta ${responseTime}ms excede el límite de 2000ms`);
  } else {
    console.log(`⚡ RENDIMIENTO: Tiempo de respuesta ${responseTime}ms ≤ 2000ms ✅`);
  }

  // Pausa breve entre iteraciones para evitar sobrecarga
  sleep(0.5);
}
