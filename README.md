# inPaaS Dev Kit

Conhecimento, extensão e utilitários compartilhados pelos projetos inPaaS desenvolvidos localmente.

## Uso em um projeto

1. Adicione esta pasta como segunda raiz do workspace do VS Code.
2. Mantenha a pasta do projeto como primeira raiz.
3. Crie no projeto um `AGENTS.md` baseado em `templates/AGENTS.project.md`.
4. Copie `templates/start-local.ps1` para o projeto e configure somente o ambiente.
5. Execute `start-local.ps1`; o runtime usado virá de `runtime/` neste kit.
6. Instale ou atualize a extensão com `scripts/install-vscode-extension.ps1`.

As regras reutilizáveis devem ser atualizadas neste kit. Regras de negócio permanecem no `AGENTS.md` do projeto correspondente.
