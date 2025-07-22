# run-all-tests.ps1
# Script para ejecutar todas las pruebas de manera automatica

Write-Host "EJECUTOR AUTOMATICO DE PRUEBAS DE RENDIMIENTO" -ForegroundColor Cyan
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

# Obtener todos los archivos de prueba
$testFiles = Get-ChildItem -Path ".\tests" -Recurse -Filter "*.js" | Where-Object { $_.Name -ne "login_token.js" }

if ($testFiles.Count -eq 0) {
    Write-Host "ERROR: No se encontraron archivos de prueba (.js) en ./tests" -ForegroundColor Red
    exit
}

Write-Host "`nSe encontraron $($testFiles.Count) archivos de prueba" -ForegroundColor Green
Write-Host "Tiempo estimado: $([math]::Round($testFiles.Count * 0.5, 1)) minutos aprox." -ForegroundColor Yellow

# Preguntar si desea continuar
$confirmar = Read-Host "`n[?] Desea ejecutar todas las pruebas? (S/N)"
if ($confirmar -notmatch "^[Ss]") {
    Write-Host "Ejecucion cancelada por el usuario." -ForegroundColor Yellow
    exit
}

# Variables para estadisticas
$exitosos = 0
$fallidos = 0
$tiempoInicio = Get-Date

Write-Host "`nINICIANDO EJECUCION AUTOMATICA..." -ForegroundColor Cyan
Write-Host ("-" * 60)

foreach ($file in $testFiles) {
    $relativePath = $file.FullName
    $filename = $file.BaseName
    $modulo = $file.Directory.Name
    
    # Generar ruta de salida (sin timestamp)
    $outputPath = ".\results\$filename.json"

    Write-Host "`n[$($exitosos + $fallidos + 1)/$($testFiles.Count)] Ejecutando: $modulo/$($file.Name)" -ForegroundColor White
    Write-Host "   Archivo: $filename" -ForegroundColor Gray
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
Write-Host "RESUMEN DE EJECUCION" -ForegroundColor Cyan
Write-Host ("=" * 60) -ForegroundColor Cyan
Write-Host "Tiempo total: $($tiempoTotal.ToString('mm\:ss'))" -ForegroundColor White
Write-Host "Total de pruebas: $($testFiles.Count)" -ForegroundColor White
Write-Host "Exitosas: $exitosos" -ForegroundColor Green
Write-Host "Fallidas: $fallidos" -ForegroundColor Red
Write-Host "Resultados guardados en: .\results\" -ForegroundColor Yellow

if ($fallidos -eq 0) {
    Write-Host "`nTODAS LAS PRUEBAS SE EJECUTARON EXITOSAMENTE!" -ForegroundColor Green
} else {
    Write-Host "`nAlgunas pruebas presentaron errores. Revise los detalles arriba." -ForegroundColor Yellow
}

Write-Host "`nPara ejecutar pruebas individuales, use: .\run-test.ps1" -ForegroundColor Cyan
