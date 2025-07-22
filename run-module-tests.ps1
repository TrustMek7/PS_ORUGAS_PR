# run-module-tests.ps1
# Script para ejecutar todas las pruebas de un modulo especifico

Write-Host "EJECUTOR DE MODULOS COMPLETOS" -ForegroundColor Cyan
Write-Host ("=" * 60) -ForegroundColor Cyan

# Verificar que existe la carpeta tests
if (!(Test-Path ".\tests")) {
    Write-Host "ERROR: No se encontro la carpeta ./tests" -ForegroundColor Red
    exit
}

# Crear carpeta de resultados si no existe
if (!(Test-Path ".\results")) {
    Write-Host "Creando carpeta de resultados..." -ForegroundColor Yellow
    New-Item -ItemType Directory -Path ".\results" | Out-Null
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
    $testsEnModulo = Get-ChildItem -Path $modulos[$i].FullName -Filter "*.js" | Where-Object { $_.Name -ne "login_token.js" }
    Write-Host " $($i + 1)) $($modulos[$i].Name) ($($testsEnModulo.Count) tests)" -ForegroundColor White
}

do {
    $moduloIndex = Read-Host "`n[?] Seleccione un modulo para ejecutar todos sus tests (1-$($modulos.Count))"
} while (-not ($moduloIndex -as [int]) -or $moduloIndex -lt 1 -or $moduloIndex -gt $modulos.Count)

$moduloSeleccionado = $modulos[$moduloIndex - 1]

# 2. Obtener todos los tests del modulo seleccionado
$tests = Get-ChildItem -Path $moduloSeleccionado.FullName -Filter "*.js" | Where-Object { $_.Name -ne "login_token.js" }

if ($tests.Count -eq 0) {
    Write-Host "ERROR: No se encontraron archivos de prueba en el modulo '$($moduloSeleccionado.Name)'." -ForegroundColor Red
    exit
}

Write-Host "`nRESUMEN DEL MODULO: $($moduloSeleccionado.Name)" -ForegroundColor Yellow
Write-Host ("-" * 50)
Write-Host "Tests encontrados: $($tests.Count)" -ForegroundColor White
Write-Host "Tiempo estimado: $([math]::Round($tests.Count * 0.5, 1)) minutos aprox." -ForegroundColor White

Write-Host "`nLISTA DE TESTS A EJECUTAR:" -ForegroundColor Gray
foreach ($test in $tests) {
    Write-Host "   - $($test.Name)" -ForegroundColor Gray
}

# Confirmar ejecucion
$confirmar = Read-Host "`n[?] Desea ejecutar todos los tests del modulo '$($moduloSeleccionado.Name)'? (S/N)"
if ($confirmar -notmatch "^[Ss]") {
    Write-Host "Ejecucion cancelada por el usuario." -ForegroundColor Yellow
    exit
}

# Variables para estadisticas
$exitosos = 0
$fallidos = 0
$tiempoInicio = Get-Date

Write-Host "`nEJECUTANDO MODULO: $($moduloSeleccionado.Name)" -ForegroundColor Cyan
Write-Host ("-" * 60)

foreach ($test in $tests) {
    $relativePath = $test.FullName
    $filename = $test.BaseName
    
    # Generar ruta de salida (sin timestamp)
    $outputPath = ".\results\$filename.json"

    Write-Host "`n[$($exitosos + $fallidos + 1)/$($tests.Count)] Ejecutando: $($test.Name)" -ForegroundColor White
    Write-Host "   Salida: $outputPath" -ForegroundColor Gray

    try {
        # Ejecutar la prueba con k6
        $resultado = k6 run "$relativePath" --summary-export "$outputPath" 2>&1
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host "   EXITO" -ForegroundColor Green
            $exitosos++
        } else {
            Write-Host "   FALLO (codigo de salida: $LASTEXITCODE)" -ForegroundColor Red
            Write-Host "   Error: $resultado" -ForegroundColor Red
            $fallidos++
        }
    }
    catch {
        Write-Host "   ERROR CRITICO: $_" -ForegroundColor Red
        $fallidos++
    }

    # Pequena pausa entre pruebas
    Start-Sleep -Seconds 1
}

# Calcular tiempo total
$tiempoFin = Get-Date
$tiempoTotal = $tiempoFin - $tiempoInicio

Write-Host "`n" + ("=" * 60) -ForegroundColor Cyan
Write-Host "RESUMEN DEL MODULO: $($moduloSeleccionado.Name)" -ForegroundColor Cyan
Write-Host ("=" * 60) -ForegroundColor Cyan
Write-Host "Tiempo total: $($tiempoTotal.ToString('mm\:ss'))" -ForegroundColor White
Write-Host "Total de pruebas: $($tests.Count)" -ForegroundColor White
Write-Host "Exitosas: $exitosos" -ForegroundColor Green
Write-Host "Fallidas: $fallidos" -ForegroundColor Red
Write-Host "Resultados guardados en: .\results\" -ForegroundColor Yellow

if ($fallidos -eq 0) {
    Write-Host "`nTODAS LAS PRUEBAS DEL MODULO SE EJECUTARON EXITOSAMENTE!" -ForegroundColor Green
} else {
    Write-Host "`nAlgunas pruebas presentaron errores. Revise los detalles arriba." -ForegroundColor Yellow
}

Write-Host "`nOtros scripts disponibles:" -ForegroundColor Cyan
Write-Host "   - .\run-test.ps1 (pruebas individuales)" -ForegroundColor Gray
Write-Host "   - .\run-all-tests.ps1 (todas las pruebas)" -ForegroundColor Gray
