param(
  [Parameter(Mandatory = $false)][string]$SiteUrl,
  [Parameter(Mandatory = $false)][string]$Token,
  [Parameter(Mandatory = $false)][string]$RepoPath
)

$ErrorActionPreference = "Stop"
if (-not $SiteUrl) { $SiteUrl = Read-Host "Adresse HTTPS du site" }
if (-not $Token) { $Token = Read-Host "Jeton permanent du relais" }
if (-not $RepoPath) { $RepoPath = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path }

if ($SiteUrl -notmatch '^https://|^http://localhost(?::\d+)?$') { throw "L'adresse du site doit utiliser HTTPS." }
if ($Token -notmatch '^fonw_[A-Za-z0-9_-]{40,60}$') { throw "Jeton invalide." }
if (-not (Test-Path -LiteralPath (Join-Path $RepoPath ".git"))) { throw "Dépôt Git introuvable." }

$nodeCommand = Get-Command node -ErrorAction Stop
$codexCommand = Get-Command codex -ErrorAction Stop
& $codexCommand.Source login status | Out-Null
if ($LASTEXITCODE -ne 0) { throw "Connectez d'abord Codex avec « codex login »." }

$sandboxOutput = & $codexCommand.Source -c 'windows.sandbox="elevated"' sandbox -C $RepoPath cmd.exe /d /c "echo FON_CODEX_SANDBOX_OK"
if ($LASTEXITCODE -ne 0 -or $sandboxOutput -notmatch 'FON_CODEX_SANDBOX_OK') {
  throw "Le bac à sable Windows élevé est indisponible. Le relais reste désactivé."
}

$workerRoot = Join-Path $env:LOCALAPPDATA "FatesOfNations\ai-worker"
$configPath = Join-Path $workerRoot "config.json"
$launchPath = Join-Path $workerRoot "launch.ps1"
$workerScript = (Resolve-Path (Join-Path $PSScriptRoot "worker.mjs")).Path
New-Item -ItemType Directory -Path $workerRoot -Force | Out-Null

@{
  siteUrl = $SiteUrl.TrimEnd('/')
  token = $Token
  repoPath = (Resolve-Path $RepoPath).Path
} | ConvertTo-Json | Set-Content -LiteralPath $configPath -Encoding UTF8

@"
`$ErrorActionPreference = "Stop"
& "$($nodeCommand.Source)" "$workerScript" --config "$configPath"
"@ | Set-Content -LiteralPath $launchPath -Encoding UTF8

& icacls.exe $workerRoot /inheritance:r /grant:r "${env:USERNAME}:(OI)(CI)F" | Out-Null
if ($LASTEXITCODE -ne 0) { throw "Impossible de protéger le jeton local." }

$taskName = "Fates of Nations - Relais Codex"
$taskCommand = "powershell.exe -WindowStyle Hidden -NoProfile -ExecutionPolicy Bypass -File `"$launchPath`""
& schtasks.exe /Create /SC ONLOGON /RL LIMITED /F /TN $taskName /TR $taskCommand | Out-Null
if ($LASTEXITCODE -ne 0) { throw "Impossible d'enregistrer le démarrage automatique." }

Start-Process -FilePath "powershell.exe" -ArgumentList @("-WindowStyle", "Hidden", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $launchPath) -WindowStyle Hidden
Write-Host "Relais installé. Son état apparaîtra dans Assistants IA sous une minute."
