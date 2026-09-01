$ErrorActionPreference = 'Stop'

$devKitRoot = if ([string]::IsNullOrWhiteSpace($env:INPAAS_DEV_KIT_ROOT)) {
  'C:\Users\tzan\www\inpaas-dev-kit'
}
else {
  $env:INPAAS_DEV_KIT_ROOT
}

$env:PLATFORM_API_URL = 'https://ambiente.plusoftomni.com.br'
$env:PLATFORM_API_USER = 'usuario@plusoft.com'
$env:PLATFORM_PROJECT_ROOT = $PSScriptRoot

# Opcional: deixe vazio para solicitar a senha ao iniciar.
$platformApiPassword = ''

if (-not [string]::IsNullOrWhiteSpace($platformApiPassword)) {
  $env:PLATFORM_API_PASSWORD = $platformApiPassword
}

$env:SOURCE_AUTO_PUBLISH = 'true'
$env:SOURCE_PUBLISH_PATH = '/api/vs-code/sources/publish'
$env:SOURCE_DOWNLOAD_PATH = '/api/vs-code/sources/{key}'
$env:FORM_AUTO_PUBLISH = 'true'
$env:FORM_DOWNLOAD_PATH = '/api/vs-code/forms/{key}'
$env:FORM_PUBLISH_PATH = '/api/vs-code/forms/publish'

$sharedStart = Join-Path $devKitRoot 'runtime\start-local.ps1'

if (-not (Test-Path -LiteralPath $sharedStart -PathType Leaf)) {
  throw 'Runtime compartilhado do inPaaS Dev Kit não encontrado: ' + $sharedStart
}

& $sharedStart
