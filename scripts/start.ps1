# Inicia CementoControl en Windows de forma sencilla.
# Uso: .\scripts\start.ps1
$ErrorActionPreference = "Stop"
Set-Location (Split-Path -Parent $PSScriptRoot)

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host "No se encontró Node.js. Instala Node.js 24 o superior." -ForegroundColor Red
  exit 1
}

if (-not (Test-Path "node_modules")) {
  Write-Host "Instalando dependencias…" -ForegroundColor Yellow
  npm install
}

if (-not (Test-Path "web\dist\index.html")) {
  Write-Host "Compilando la interfaz…" -ForegroundColor Yellow
  npm run build
}

if (-not (Test-Path ".env")) {
  Copy-Item ".env.example" ".env"
  Write-Host "Se creó .env. Puedes ajustar el puerto y el host allí." -ForegroundColor Cyan
}

Write-Host "Iniciando CementoControl en http://127.0.0.1:8787" -ForegroundColor Green
npm start
