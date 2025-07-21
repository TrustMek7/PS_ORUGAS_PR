# PS_ORUGAS_PR
Pruebas de Rendimiento - TeamMates

Ejecutar todas las pruebas a detalle:
$testFiles = Get-ChildItem -Path ".\tests" -Recurse -Filter "*.js"

foreach ($file in $testFiles) {
    $relativePath = $file.FullName
    $filename = $file.BaseName
    $outputPath = ".\results\$filename.json"

    Write-Host "Ejecutando prueba: $relativePath"
    k6 run "$relativePath" --summary-export "$outputPath"
}