import http from 'k6/http';
import { check, sleep } from 'k6';
import { getHeadersWithCSRF } from '../login_token.js';

export const options = {
  vus: 1,          // UN SOLO usuario (administrador)
  iterations: 100, // 100 cursos secuenciales
  duration: '10m', // Tiempo máximo permitido
};

// Datos de ejemplo para crear cursos variados
const cursosEjemplo = [
  { id: 'CS101', name: 'Introducción a Ciencias de la Computación', category: 'Tecnología' },
  { id: 'MATH201', name: 'Cálculo Diferencial e Integral', category: 'Matemáticas' },
  { id: 'PHY301', name: 'Física Cuántica Avanzada', category: 'Ciencias' },
  { id: 'BIO101', name: 'Biología Molecular', category: 'Ciencias' },
  { id: 'CHEM202', name: 'Química Orgánica', category: 'Ciencias' },
  { id: 'ENG301', name: 'Literatura Contemporánea', category: 'Humanidades' },
  { id: 'HIST101', name: 'Historia Universal', category: 'Humanidades' },
  { id: 'ECON201', name: 'Microeconomía', category: 'Economía' },
  { id: 'PSYC101', name: 'Psicología General', category: 'Psicología' },
  { id: 'ART201', name: 'Arte Digital Moderno', category: 'Arte' },
  { id: 'MED101', name: 'Anatomía Humana Básica', category: 'Medicina' },
  { id: 'LAW201', name: 'Derecho Civil', category: 'Derecho' },
  { id: 'EDU101', name: 'Pedagogía Moderna', category: 'Educación' },
  { id: 'MUSIC201', name: 'Teoría Musical Avanzada', category: 'Música' },
  { id: 'SPORT101', name: 'Entrenamiento Deportivo', category: 'Deportes' }
];

// Información del administrador basada en datos funcionales
const administrador = {
  email: 'jcusilaymeg@unsa.edu.pe',  // Usuario funcional descubierto
  name: 'Juan Carlos Usilay Mejia',
  institute: 'UNSA'
};

// Variables para métricas de rendimiento
let cursosCreados = 0;
let tiempoInicio = Date.now();
let tiemposRespuesta = [];

export default function () {
  const iterationId = __ITER;
  
  // Seleccionar curso de ejemplo rotativo
  const cursoIndex = iterationId % cursosEjemplo.length;
  const baseCurso = cursosEjemplo[cursoIndex];
  
  // Crear curso único para esta iteración
  const cursoUnico = {
    courseId: `${baseCurso.id}-ADMIN-${iterationId}-${Date.now()}`,
    courseName: `${baseCurso.name} - Curso ${iterationId + 1}/100`,
    institute: administrador.institute,
    timeZone: 'UTC'
  };

  // URL del endpoint de creación de curso
  const createUrl = `https://teammates-orugas.appspot.com/webapi/course?instructoremail=${administrador.email}&instructorname=${encodeURIComponent(administrador.name)}&instructorinstitution=${administrador.institute}`;
  const payload = JSON.stringify(cursoUnico);
  
  const inicioRequest = Date.now();
  const createRes = http.post(createUrl, payload, { headers: getHeadersWithCSRF() });
  const tiempoRequest = Date.now() - inicioRequest;
  
  tiemposRespuesta.push(tiempoRequest);
  
  // Validaciones específicas para carga secuencial
  const validaciones = check(createRes, {
    '✅ Curso creado exitosamente': (r) => r.status === 200 || r.status === 201,
    '✅ Respuesta rápida (≤5s por curso)': (r) => tiempoRequest <= 5000,
    '✅ Sin errores del servidor': (r) => r.status !== 500 && r.status !== 502 && r.status !== 503,
    '✅ Autenticación válida': (r) => r.status !== 401 && r.status !== 403,
    '✅ Payload procesado correctamente': (r) => r.body && r.body.length > 0,
  });

  // Contabilizar cursos exitosos
  if (createRes.status === 200 || createRes.status === 201) {
    cursosCreados++;
    console.log(`✅ ADMIN: Curso ${iterationId + 1}/100 creado exitosamente (${tiempoRequest}ms) - ${cursoUnico.courseId}`);
  } else {
    console.log(`❌ ADMIN: Error en curso ${iterationId + 1}/100 - Status ${createRes.status} (${tiempoRequest}ms)`);
    if (createRes.body) {
      console.log(`   Detalles: ${createRes.body.substring(0, 200)}`);
    }
  }

  // Pausa mínima entre requests para evitar rate limiting
  sleep(0.05); // 50ms entre creaciones para máximo rendimiento

  return {
    iteration: iterationId + 1,
    courseId: cursoUnico.courseId,
    category: baseCurso.category,
    requestTime: tiempoRequest,
    status: createRes.status,
    success: createRes.status === 200 || createRes.status === 201
  };
}

export function handleSummary(data) {
  const tiempoTotal = Date.now() - tiempoInicio;
  const tiempoTotalSegundos = (tiempoTotal / 1000).toFixed(2);
  
  const stats = {
    checksExitosos: data.metrics.checks?.values.passes || 0,
    checksTotal: data.metrics.checks?.values.count || 0,
    requestsTotal: data.metrics.http_reqs?.values.count || 0,
    duracionPromedio: Math.round(data.metrics.http_req_duration?.values.avg || 0),
    duracionMax: Math.round(data.metrics.http_req_duration?.values.max || 0),
    iteraciones: data.metrics.iterations?.values.count || 0,
  };
  
  const exitoTotal = stats.checksTotal > 0 ? Math.round((stats.checksExitosos / stats.checksTotal) * 100) : 0;
  const cursosExitosos = Math.round(stats.requestsTotal * (exitoTotal / 100));
  const velocidadCreacion = stats.requestsTotal > 0 ? (stats.requestsTotal / (tiempoTotal / 1000)).toFixed(2) : 0;

  return {
    'stdout': `
════════════════════════════════════════════════════════════════════════════════════
  🎯 PR-02.2-01: CARGA SECUENCIAL - CREACIÓN MASIVA DE CURSOS (ADMINISTRADOR)
════════════════════════════════════════════════════════════════════════════════════
  📊 RESUMEN: ${stats.checksExitosos}/${stats.checksTotal} checks (${exitoTotal}%)
  🌐 HTTP: ${stats.requestsTotal} requests secuenciales
  ⏱️ TIEMPO: ${tiempoTotalSegundos}s total (objetivo: ≤5s por curso)
  📈 RENDIMIENTO: ${stats.duracionPromedio}ms promedio, ${stats.duracionMax}ms máximo
  🎯 CURSOS CREADOS: ${cursosExitosos} de ${stats.requestsTotal} intentos
  🚀 VELOCIDAD: ${velocidadCreacion} cursos/segundo
  👤 ADMINISTRADOR: ${administrador.email} (${administrador.institute})
  ✅ OBJETIVO: Verificar estabilidad con carga secuencial alta de 100 cursos
════════════════════════════════════════════════════════════════════════════════════
`
  };
}
