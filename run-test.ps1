# run-test.ps1
# Script para ejecutar pruebas individuales de manera interactiva

Write-Host "EJECUTOR INTERACTIVO DE PRUEBAS DE RENDIMIENTO" -ForegroundColor Cyan
Write-Host ("=" * 60) -ForegroundColor Cyan

# Verificar que existe la carpeta tests
if (!(Test-Path ".\tests")) {
    Write-Host "ERROR: No se encontro la carpeta ./tests" -ForegroundColor Red
    exit
}

# 1. Mostrar los modulos disponibles (carpetas en ./tests)
$modulos = Get-ChildItem -Path ".\tests" -Directory

if ($modulos.Count -eq 0) {
    Write-Host "ERROR: No se encontraron modulos dentro de la carpeta ./tests" -ForegroundColor Red
    exit
}

Write-Host "`nMODULOS DISPONIBLES" -ForegroundColor Yellow
Write-Host ("-" * 30)
for ($i = 0; $i -lt $modulos.Count; $i++) {
    Write-Host " $($i + 1)) $($modulos[$i].Name)" -ForegroundColor White
}

do {
    $moduloIndex = Read-Host "`n[?] Seleccione un modulo (1-$($modulos.Count))"
    $moduloIndexInt = $moduloIndex -as [int]
    if (-not $moduloIndexInt -or $moduloIndexInt -lt 1 -or $moduloIndexInt -gt $modulos.Count) {
        Write-Host "ERROR: Por favor ingrese un numero valido entre 1 y $($modulos.Count)" -ForegroundColor Red
    }
} while (-not $moduloIndexInt -or $moduloIndexInt -lt 1 -or $moduloIndexInt -gt $modulos.Count)

$moduloIndex = $moduloIndexInt

$moduloSeleccionado = $modulos[$moduloIndex - 1].FullName

# 2. Mostrar los test disponibles dentro del modulo
$tests = Get-ChildItem -Path $moduloSeleccionado -Filter "*.js"

if ($tests.Count -eq 0) {
    Write-Host "ERROR: No se encontraron archivos de prueba en el modulo seleccionado." -ForegroundColor Red
    exit
}

Write-Host "`nTESTS DISPONIBLES EN '$($modulos[$moduloIndex - 1].Name)'" -ForegroundColor Yellow
Write-Host ("-" * 50)
for ($i = 0; $i -lt $tests.Count; $i++) {
    Write-Host " $($i + 1)) $($tests[$i].Name)" -ForegroundColor White
}

do {
    $testIndex = Read-Host "`n[?] Seleccione un test (1-$($tests.Count))"
    $testIndexInt = $testIndex -as [int]
    if (-not $testIndexInt -or $testIndexInt -lt 1 -or $testIndexInt -gt $tests.Count) {
        Write-Host "ERROR: Por favor ingrese un numero valido entre 1 y $($tests.Count)" -ForegroundColor Red
    }
} while (-not $testIndexInt -or $testIndexInt -lt 1 -or $testIndexInt -gt $tests.Count)

$testIndex = $testIndexInt

$testSeleccionado = $tests[$testIndex - 1].FullName
$nombreArchivo = $tests[$testIndex - 1].BaseName

# 3. Crear carpeta de resultados si no existe
if (!(Test-Path ".\results")) {
    Write-Host "`nCreando carpeta de resultados..." -ForegroundColor Yellow
    New-Item -ItemType Directory -Path ".\results" | Out-Null
}

# 4. Generar ruta de salida (sin timestamp)
$output = ".\results\$nombreArchivo.json"

# 5. Ejecutar prueba
Write-Host "`nEJECUTANDO PRUEBA" -ForegroundColor Cyan
Write-Host ("-" * 30)
Write-Host "Test: $nombreArchivo" -ForegroundColor White
Write-Host "Modulo: $($modulos[$moduloIndex - 1].Name)" -ForegroundColor White
Write-Host "Salida: $output" -ForegroundColor White
Write-Host ""

try {
    k6 run "$testSeleccionado" --summary-export "$output"
    Write-Host "`nPRUEBA COMPLETADA EXITOSAMENTE" -ForegroundColor Green
    Write-Host "Resultado guardado en: $output" -ForegroundColor Yellow
}
catch {
    Write-Host "`nERROR AL EJECUTAR EL TEST" -ForegroundColor Red
    Write-Host "Detalles: $_" -ForegroundColor Red
}

Write-Host "`nPara ejecutar todas las pruebas automaticamente, use: .\run-all-tests.ps1" -ForegroundColor Cyan
