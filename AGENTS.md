# inPaaS Development Kit

Este repositório privado contém o runtime, a extensão VS Code, scripts e
templates compartilhados pelos projetos inPaaS. Alterações nele são restritas
aos mantenedores do kit.

## Base de conhecimento compartilhada

Os contratos, padrões e procedimentos usados pela IA ficam no repositório
separado `inpaas-ai-knowledge`. Antes de atuar em um projeto que use este kit,
leia integralmente o `AGENTS.md` desse repositório e os documentos aplicáveis
em `docs/`.

No workspace de desenvolvimento padrão, a base está em:

`C:\Users\tzan\www\inpaas-ai-knowledge`

Em outra máquina, mantenha os dois repositórios como pastas irmãs ou defina o
caminho da base no `AGENTS.md` do projeto. Use
`scripts/update-ai-knowledge.ps1` para clonar ou atualizar a cópia irmã sem
sobrescrever alterações locais.

## Limites de atuação

- Nunca criar implicitamente um source, form, entidade, módulo, pattern ou
  outro cadastro da plataforma.
- Sources e forms precisam existir previamente no Studio e devem ser baixados
  por sua chave.
- É permitido alterar recursos locais já baixados e publicar as alterações.
- Quando um novo recurso for necessário, explicar o conteúdo sugerido e pedir
  que o usuário faça o cadastro no Studio antes do download.
- Não modificar fontes da plataforma Java usados como referência sem
  solicitação explícita.
- Preservar alterações existentes e evitar operações destrutivas.

## Estrutura deste repositório

- `runtime/`: servidor local, proxy e inicialização compartilhados.
- `vscode-extension/`: código-fonte único da extensão inPaaS Studio Tools.
- `scripts/`: instalação e utilitários compartilhados.
- `templates/`: arquivos iniciais para novos projetos.
- `references/`: cópias de referência da plataforma; não as editar sem pedido
  explícito.

Regras reutilizáveis da plataforma pertencem à base de conhecimento, não a
este repositório. Decisões exclusivas de negócio permanecem no projeto que as
originou.
