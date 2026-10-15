# FlowForge Dual-Service Dev Launcher
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "   FlowForge Distributed Platform Launcher   " -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan

$serverDir = Join-Path $PSScriptRoot "server"
$clientDir = Join-Path $PSScriptRoot "client"

Write-Host "[1/2] Starting FlowForge API Server on port 5000..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$serverDir'; npm run dev"

Write-Host "[2/2] Starting FlowForge React UI on port 5173..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$clientDir'; npm run dev"

Write-Host "`nServices launching in separate terminals!" -ForegroundColor Yellow
Write-Host "Open your browser at: http://localhost:5173/" -ForegroundColor Yellow
