Write-Host ""
Write-Host " DevTools Companion for Angular — Build Firefox XPI"
Write-Host " ===================================================="
Write-Host ""

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host " ERROR: Node.js no encontrado. Instálalo desde https://nodejs.org" -ForegroundColor Red
    exit 1
}

Set-Location $PSScriptRoot
node build.js firefox
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host " Build fallido." -ForegroundColor Red
    exit 1
}
