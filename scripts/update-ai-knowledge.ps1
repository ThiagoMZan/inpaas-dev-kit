param(
  [string]$KnowledgePath = (Join-Path (Split-Path $PSScriptRoot -Parent) '..\inpaas-ai-knowledge'),
  [switch]$NoPull
)

$ErrorActionPreference = 'Stop'
$repositoryUrl = 'https://github.com/ThiagoMZan/inpaas-ai-knowledge.git'
$resolvedPath = [System.IO.Path]::GetFullPath($KnowledgePath)

if (-not (Test-Path -LiteralPath $resolvedPath)) {
  git clone $repositoryUrl $resolvedPath
  if ($LASTEXITCODE -ne 0) { throw 'Não foi possível clonar a base de conhecimento.' }
  Write-Host ('Base de conhecimento clonada em: ' + $resolvedPath) -ForegroundColor Green
  return
}

if (-not (Test-Path -LiteralPath (Join-Path $resolvedPath '.git'))) {
  throw ('O caminho informado não é um repositório Git: ' + $resolvedPath)
}

if ($NoPull) {
  Write-Host ('Base de conhecimento encontrada em: ' + $resolvedPath)
  return
}

$changes = git -C $resolvedPath status --porcelain
if ($LASTEXITCODE -ne 0) { throw 'Não foi possível verificar a base de conhecimento.' }
if ($changes) {
  throw 'A base de conhecimento possui alterações locais. Faça commit, stash ou use -NoPull antes de atualizar.'
}

git -C $resolvedPath pull --ff-only origin main
if ($LASTEXITCODE -ne 0) { throw 'Não foi possível atualizar a base de conhecimento.' }

Write-Host ('Base de conhecimento atualizada em: ' + $resolvedPath) -ForegroundColor Green
