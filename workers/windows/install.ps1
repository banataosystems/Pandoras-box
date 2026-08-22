param(
  [string]$InstallRoot = 'C:\ProgramData\PandoraWorker',
  [string]$WorkerId = "pandora-win-$($env:COMPUTERNAME.ToLowerInvariant())"
)

$ErrorActionPreference = 'Stop'

function Require-Command([string]$Name) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Required command not found: $Name"
  }
}

Require-Command node
Require-Command git

$nodeMajor = [int]((& node -p "process.versions.node.split('.')[0]").Trim())
if ($nodeMajor -lt 22) {
  throw "Node.js 22 or newer is required. Found: $(& node --version)"
}

New-Item -ItemType Directory -Force -Path $InstallRoot | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $InstallRoot 'work') | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $InstallRoot 'evidence') | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $InstallRoot 'keys') | Out-Null

$sourceDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Copy-Item -Force (Join-Path $sourceDir 'pandora-worker.mjs') $InstallRoot
Copy-Item -Force (Join-Path $sourceDir 'job-contract.mjs') $InstallRoot

$envFile = Join-Path $InstallRoot 'worker.env.ps1'
@"
`$env:PANDORA_WORKER_ID = '$WorkerId'
`$env:PANDORA_WORKER_ROOT = '$InstallRoot'
# After governed enrollment, set this to Pandora's registered control public key file:
# `$env:PANDORA_WORKER_CONTROL_PUBLIC_KEY_FILE = '$InstallRoot\keys\control-public.pem'
"@ | Set-Content -Encoding UTF8 $envFile

# Restrict the worker folder to local Administrators and SYSTEM. This stores no provider secret.
& icacls $InstallRoot /inheritance:r /grant:r 'SYSTEM:(OI)(CI)F' 'Administrators:(OI)(CI)F' | Out-Null

Write-Host "Pandora Windows Worker v1 installed at $InstallRoot"
Write-Host "Worker ID: $WorkerId"
Write-Host "No GitHub, Supabase, Vercel, or production credentials were installed."
Write-Host "Load environment with: . '$envFile'"
Write-Host "Then run a local verification job with an exact SHA."
