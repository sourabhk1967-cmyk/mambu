$repo = Split-Path -Parent $PSScriptRoot
$node = (Get-Command node -ErrorAction Stop).Source
$stdout = Join-Path $PSScriptRoot 'kyrovia-supervisor-launch.out.log'
$stderr = Join-Path $PSScriptRoot 'kyrovia-supervisor-launch.err.log'
$lockFile = Join-Path $PSScriptRoot 'supervisor.pid'
$stopRequest = Join-Path $PSScriptRoot 'stop.request'

if (Test-Path -LiteralPath $stopRequest) {
  Remove-Item -LiteralPath $stopRequest -Force -ErrorAction SilentlyContinue
}

if (Test-Path -LiteralPath $lockFile) {
  $existingPid = [int](Get-Content -LiteralPath $lockFile -Raw)
  $existing = Get-Process -Id $existingPid -ErrorAction SilentlyContinue

  if ($existing) {
    Write-Output "Kyrovia supervised live mode is already running with PID $existingPid."
    exit 0
  }

  Remove-Item -LiteralPath $lockFile -Force -ErrorAction SilentlyContinue
}

$env:KYROVIA_TUNNEL_SUBDOMAIN = 'kyrovia'
$env:KYROVIA_TUNNEL_ACQUIRE_TIMEOUT_MS = '0'
$env:KYROVIA_PUBLIC_FAILURE_LIMIT = '3'
$env:KYROVIA_PUBLIC_HEALTH_TIMEOUT_MS = '5000'
$env:KYROVIA_TUNNEL_RESTART_MS = '3000'
$env:KYROVIA_SUPERVISOR_CHECK_MS = '5000'

if (-not $env:CORS_ORIGIN) {
  $env:CORS_ORIGIN = 'https://mambu.onrender.com,https://mambu.in,https://www.mambu.in,http://localhost:5173'
}

if (-not $env:PUBLIC_APP_URL) {
  $env:PUBLIC_APP_URL = 'https://mambu.onrender.com'
}

$process = Start-Process `
  -FilePath $node `
  -ArgumentList '.tunnel\start-kyrovia-supervisor.js' `
  -WorkingDirectory $repo `
  -WindowStyle Hidden `
  -RedirectStandardOutput $stdout `
  -RedirectStandardError $stderr `
  -PassThru

Write-Output "Kyrovia supervised live mode started with PID $($process.Id)."
Write-Output 'Public URL: https://kyrovia.loca.lt'
Write-Output 'Manual stop: npm run stop:supervised'
