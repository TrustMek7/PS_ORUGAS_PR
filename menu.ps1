# menu.ps1
# Script principal con menu de opciones para ejecutar pruebas

Write-Host "SISTEMA DE PRUEBAS DE RENDIMIENTO - TeamMates" -ForegroundColor Cyan
Write-Host ("=" * 60) -ForegroundColor Cyan
Write-Host "Proyecto: PS_ORUGAS_PR" -ForegroundColor White
Write-Host "$(Get-Date -Format 'dd/MM/yyyy HH:mm:ss')" -ForegroundColor Gray

# Verificar que k6 esta instalado
try {
    k6 version 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "k6 no encontrado"
    }
} catch {
    Write-Host "`nERROR: k6 no esta instalado o no esta en el PATH" -ForegroundColor Red
    Write-Host "Instale k6 desde: https://k6.io/docs/get-started/installation/" -ForegroundColor Yellow
    exit
}

# Verificar estructura del proyecto
if (!(Test-Path ".\tests")) {
    Write-Host "`nERROR: No se encontro la carpeta ./tests" -ForegroundColor Red
    exit
}

# Contar tests disponibles
$totalTests = (Get-ChildItem -Path ".\tests" -Recurse -Filter "*.js" | Where-Object { $_.Name -ne "login_token.js" }).Count
$modulos = (Get-ChildItem -Path ".\tests" -Directory).Count

Write-Host "`nESTADISTICAS DEL PROYECTO" -ForegroundColor Yellow
Write-Host ("-" * 30)
Write-Host "Modulos disponibles: $modulos" -ForegroundColor White
Write-Host "Total de tests: $totalTests" -ForegroundColor White

do {
    Write-Host "`nOPCIONES DE EJECUCION" -ForegroundColor Yellow
    Write-Host ("-" * 30)
    Write-Host " 1) Ejecutar test individual (interactivo)" -ForegroundColor White
    Write-Host " 2) Ejecutar modulo completo" -ForegroundColor White
    Write-Host " 3) Ejecutar todas las pruebas" -ForegroundColor White
    Write-Host " 4) Ver resultados anteriores" -ForegroundColor White
    Write-Host " 5) Limpiar resultados" -ForegroundColor White
    Write-Host " 6) Salir" -ForegroundColor White

    $opcion = Read-Host "`n[?] Seleccione una opcion (1-6)"

    switch ($opcion) {
        "1" {
            Write-Host "`nIniciando ejecucion interactiva..." -ForegroundColor Green
            & ".\run-test.ps1"
        }
        "2" {
            Write-Host "`nIniciando ejecucion por modulo..." -ForegroundColor Green
            & ".\run-module-tests.ps1"
        }
        "3" {
            Write-Host "`nIniciando ejecucion completa..." -ForegroundColor Green
            & ".\run-all-tests.ps1"
        }
        "4" {
            Write-Host "`nRESULTADOS ANTERIORES" -ForegroundColor Yellow
            Write-Host ("-" * 30)
            if (Test-Path ".\results") {
                $resultados = Get-ChildItem -Path ".\results" -Filter "*.json" | Sort-Object LastWriteTime -Descending
                if ($resultados.Count -gt 0) {
                    Write-Host "Carpeta: .\results\" -ForegroundColor Gray
                    Write-Host "Total de archivos: $($resultados.Count)" -ForegroundColor White
                    Write-Host "`nRESULTADOS DISPONIBLES:" -ForegroundColor White
                    $resultados | ForEach-Object {
                        $tamano = [math]::Round($_.Length / 1KB, 1)
                        Write-Host "   - $($_.Name) ($tamano KB) - Ultima ejecucion: $($_.LastWriteTime.ToString('dd/MM/yyyy HH:mm'))" -ForegroundColor Gray
                    }
                } else {
                    Write-Host "No hay resultados disponibles." -ForegroundColor Gray
                }
            } else {
                Write-Host "La carpeta de resultados no existe." -ForegroundColor Gray
            }
        }
        "5" {
            Write-Host "`nLIMPIAR RESULTADOS" -ForegroundColor Yellow
            Write-Host ("-" * 30)
            if (Test-Path ".\results") {
                $resultados = Get-ChildItem -Path ".\results" -Filter "*.json"
                if ($resultados.Count -gt 0) {
                    Write-Host "Se encontraron $($resultados.Count) archivos de resultados" -ForegroundColor White
                    $confirmar = Read-Host "[?] Esta seguro de que desea eliminar todos los resultados? (S/N)"
                    if ($confirmar -match "^[Ss]") {
                        Remove-Item ".\results\*.json" -Force
                        Write-Host "Resultados eliminados correctamente." -ForegroundColor Green
                    } else {
                        Write-Host "Operacion cancelada." -ForegroundColor Yellow
                    }
                } else {
                    Write-Host "No hay resultados para eliminar." -ForegroundColor Gray
                }
            } else {
                Write-Host "La carpeta de resultados no existe." -ForegroundColor Gray
            }
        }
        "6" {
            Write-Host "`nHasta luego!" -ForegroundColor Green
            exit
        }
        default {
            Write-Host "`nOpcion no valida. Por favor, seleccione un numero del 1 al 6." -ForegroundColor Red
        }
    }

    if ($opcion -ne "6") {
        Read-Host "`n[Presione Enter para continuar...]"
    }

} while ($opcion -ne "6")
