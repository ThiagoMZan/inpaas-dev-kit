# inPaaS Dev Kit

Runtime, extensão VS Code e utilitários compartilhados pelos projetos inPaaS
desenvolvidos localmente. A base de conhecimento operacional da IA está no
repositório separado `inpaas-ai-knowledge`.

## Uso em um projeto

1. Clone `inpaas-ai-knowledge` ao lado deste repositório, ou execute
   `scripts/update-ai-knowledge.ps1`.
2. Adicione o projeto, este kit e a base de conhecimento como raízes do
   workspace do VS Code; mantenha o projeto como primeira raiz.
3. Crie no projeto um `AGENTS.md` baseado em `templates/AGENTS.project.md`.
4. Copie `templates/start-local.ps1` para o projeto e configure somente o ambiente.
5. Execute `start-local.ps1`; o runtime usado virá de `runtime/` neste kit.
6. Instale ou atualize a extensão com `scripts/install-vscode-extension.ps1`.

As regras reutilizáveis devem ser atualizadas em `inpaas-ai-knowledge`. Regras
de negócio permanecem no `AGENTS.md` do projeto correspondente.
