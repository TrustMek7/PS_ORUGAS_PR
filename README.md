# PS_ORUGAS_PR
Pruebas de Rendimiento - TeamMates

## 🚀 Scripts de Ejecución

### 📋 Menú Principal
```powershell
.\menu.ps1
```
Script principal con interfaz interactiva que permite acceder a todas las opciones de ejecución.

### 🎯 Ejecución Individual (Interactiva)
```powershell
.\run-test.ps1
```
Permite seleccionar un módulo y luego un test específico para ejecutar. Ideal para pruebas puntuales o debugging.

### 📦 Ejecución por Módulo
```powershell
.\run-module-tests.ps1
```
Ejecuta todos los tests de un módulo específico. Útil para validar un área funcional completa.

### 🚀 Ejecución Completa
```powershell
.\run-all-tests.ps1
```
Ejecuta automáticamente todos los tests de todos los módulos. Ideal para validaciones completas del sistema.

### 🔄 Conversión de Archivos Existentes
```powershell
.\convert-results.ps1
```
Convierte archivos existentes con timestamp al nuevo formato sin timestamp. Mantiene solo la versión más reciente de cada test.

## 📊 Resultados

Todos los resultados se guardan en formato JSON en la carpeta `./results/` con el siguiente formato:
- **Nombre:** `{nombre-test}.json` (sin timestamp)
- **Ejemplo:** `PR-01.1-01.json`, `PR-02.3-02.json`
- **Comportamiento:** Los archivos se sobrescriben en cada ejecución para mantener datos en tiempo real

### 🔄 Gestión de Archivos en Tiempo Real
- ✅ **Un archivo por test**: Cada test genera un archivo único que se actualiza en cada ejecución
- ✅ **Sin duplicados**: No se acumulan múltiples versiones con timestamps  
- ✅ **Datos actuales**: Siempre contiene los resultados de la última ejecución
- ✅ **Integración en tiempo real**: Ideal para dashboards y monitoreo continuo

## 📂 Estructura de Tests

```
tests/
├── Gestión de Instructores/
├── Gestión de Cursos/
├── Gestión de Estudiantes/
├── Sesiones de Feedback/
└── Búsqueda y Utilidades/
```

## 🛠️ Requisitos

- **k6**: Herramienta de testing de carga
- **PowerShell**: Para ejecutar los scripts (incluido en Windows)

### Instalación de k6
```powershell
# Usando Chocolatey
choco install k6

# O descargar desde: https://k6.io/docs/get-started/installation/
```

## 💡 Características

- ✅ Interfaz amigable con colores y mensajes claros
- ✅ **Archivos JSON sin timestamp** para integración en tiempo real
- ✅ **Sobrescritura automática** - cada test mantiene un único archivo actualizado
- ✅ Estadísticas de ejecución en tiempo real
- ✅ Manejo de errores y reportes detallados
- ✅ Estimación de tiempo de ejecución
- ✅ Gestión de resultados anteriores
- ✅ **Conversión de archivos existentes** con timestamp

## 🎨 Ejemplos de Uso

### Ejecutar una prueba específica:
```powershell
# Usar el menú
.\menu.ps1
# Seleccionar opción 1, luego elegir módulo y test
```

### Ejecutar todas las pruebas de Gestión de Instructores:
```powershell
# Usar el menú
.\menu.ps1
# Seleccionar opción 2, luego elegir "Gestión de Instructores"
```

### Ejecutar todo el suite de pruebas:
```powershell
# Usar el menú
.\menu.ps1
# Seleccionar opción 3
```