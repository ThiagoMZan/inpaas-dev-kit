$ErrorActionPreference = 'Stop'

$runtimeDirectory = $PSScriptRoot
$serverPath = Join-Path $runtimeDirectory 'server.js'

if ([string]::IsNullOrWhiteSpace($env:PLATFORM_PROJECT_ROOT)) {
  $env:PLATFORM_PROJECT_ROOT = (Get-Location).Path
}

if (-not (Test-Path -LiteralPath $env:PLATFORM_PROJECT_ROOT -PathType Container)) {
  throw 'PLATFORM_PROJECT_ROOT não aponta para uma pasta válida: ' +
    $env:PLATFORM_PROJECT_ROOT
}

if (-not (Test-Path -LiteralPath $serverPath -PathType Leaf)) {
  throw 'Servidor compartilhado não encontrado: ' + $serverPath
}

$passwordWasProvided = -not [string]::IsNullOrWhiteSpace(
  $env:PLATFORM_API_PASSWORD
)

if (-not $passwordWasProvided) {
  $securePassword = Read-Host 'Senha da API' -AsSecureString
  $passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR(
    $securePassword
  )

  try {
    $env:PLATFORM_API_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR(
      $passwordPointer
    )
  }
  finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer)
  }
}

try {
  node $serverPath
}
finally {
  if (-not $passwordWasProvided) {
    Remove-Item Env:PLATFORM_API_PASSWORD -ErrorAction SilentlyContinue
  }
}
