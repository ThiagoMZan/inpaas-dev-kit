# inPaaS Development Kit

Este diretório é a fonte central de conhecimento para projetos inPaaS desenvolvidos localmente no VS Code.

Antes de atuar em qualquer projeto que referencie este kit, leia integralmente:

- `docs/platform.md` para contratos de sources, forms, Nashorn e execução local;
- `docs/form-design.md` quando houver leitura, criação ou alteração do XML de design de forms tradicionais;
- `docs/form-data-binding.md` quando fields forem ligados a entities ou o trabalho envolver save e mestre-detalhe;
- `docs/corporate-identification.md` quando o trabalho envolver busca ou identificação corporativa de pessoas;
- `docs/frontend-plugins.md` quando houver HTML, CSS ou plugins JavaScript/jQuery;
- o `AGENTS.md` próprio do projeto para regras funcionais e decisões locais.

## Fonte oficial

Regras reutilizáveis da plataforma devem ser corrigidas aqui, não copiadas e mantidas independentemente em cada projeto. O `AGENTS.md` do projeto deve conter somente uma referência a este kit e informações específicas daquele projeto.

## Limites de atuação

- Nunca criar implicitamente um source, form, entidade, módulo, pattern ou outro cadastro da plataforma.
- Sources e forms precisam existir previamente no Studio e devem ser baixados por sua chave.
- É permitido alterar recursos locais já baixados e publicar as alterações.
- Quando um novo recurso for necessário, explicar o conteúdo sugerido e pedir que o usuário faça o cadastro no Studio antes do download.
- Não modificar fontes da plataforma Java usados como referência sem solicitação explícita.
- Preservar alterações existentes e evitar operações destrutivas.

## Estrutura compartilhada

- `runtime/`: servidor local, proxy e inicialização compartilhados por todos os projetos.
- `vscode-extension/`: código-fonte único da extensão inPaaS Studio Tools.
- `scripts/`: instalação e utilitários compartilhados.
- `templates/`: arquivos iniciais para novos projetos.
- `docs/`: contratos e padrões reutilizáveis.

## Atualização contínua

Ao descobrir ou corrigir um comportamento reutilizável da plataforma, atualizar a documentação deste kit no mesmo trabalho. Decisões exclusivas de negócio permanecem no projeto que as originou.
