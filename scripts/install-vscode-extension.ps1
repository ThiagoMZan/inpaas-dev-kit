$ErrorActionPreference = 'Stop'

$sourceDirectory = Join-Path (Split-Path $PSScriptRoot -Parent) 'vscode-extension'
$manifestPath = Join-Path $sourceDirectory 'package.json'

if (-not (Test-Path -LiteralPath $sourceDirectory -PathType Container)) {
  throw 'A pasta vscode-extension do inpaas-dev-kit não foi encontrada.'
}

$extensionVersion = (Get-Content -LiteralPath $manifestPath -Raw |
  ConvertFrom-Json).version
$extensionsDirectory = Join-Path $env:USERPROFILE '.vscode\extensions'
$targetDirectory = Join-Path $extensionsDirectory (
  'inpaas-local.inpaas-source-tools-' + $extensionVersion
)

New-Item -ItemType Directory -Path $targetDirectory -Force | Out-Null
Copy-Item -Path (Join-Path $sourceDirectory '*') `
  -Destination $targetDirectory `
  -Recurse `
  -Force

Write-Host 'Extensão inPaaS Studio Tools instalada.' -ForegroundColor Green
Write-Host ('Origem: ' + $sourceDirectory)
Write-Host ('Destino: ' + $targetDirectory)
Write-Host 'No VS Code, execute: Developer: Reload Window'
