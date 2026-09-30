# inPaaS Development Kit

Este repositório privado contém o runtime, a extensão VS Code, scripts e
templates compartilhados pelos projetos inPaaS. Alterações nele são restritas
aos mantenedores do kit.

## Base de conhecimento compartilhada

Os contratos, padrões e procedimentos usados pela IA ficam no repositório
separado `inpaas-ai-knowledge`. Antes de atuar em um projeto que use este kit,
leia integralmente o `AGENTS.md` desse repositório e os documentos aplicáveis
em `docs/`.

Mantenha os dois repositórios como pastas irmãs. A partir da raiz do kit, a
base está em:

`..\inpaas-ai-knowledge\AGENTS.md`

Se essa estrutura não puder ser usada, defina o caminho da base no `AGENTS.md`
do projeto. Use
`scripts/update-ai-knowledge.ps1` para clonar ou atualizar a cópia irmã sem
sobrescrever alterações locais.

## Base de conhecimento privada opcional

Após ler a base compartilhada, se existir, leia também a base privada local do
usuário:

`..\inpaas-private-knowledge\AGENTS.md`

Essa pasta é privada e não deve ser adicionada ao workspace compartilhado nem
ter seu conteúdo copiado para o kit ou para a base compartilhada.

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
