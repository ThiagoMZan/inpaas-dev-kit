# inPaaS Studio Tools

Extensão local, sem dependências, para integrar o VS Code ao servidor de
desenvolvimento inPaaS deste workspace. Ela trata sources, forms e entities já
cadastrados na plataforma e não cria cadastros.

## Estrutura alvo do workspace

```text
source/
├── *.js
├── *.css
└── *.html

forms/
└── module.key.form/
    ├── form.html
    ├── form.css
    ├── form.js
    └── form.xml

forms-vue/
└── module.key.component.vue/
    └── Nome funcional.vue
```

Todos os sources ficam juntos em `source/`. A engine e o tipo do source vêm dos
metadados retornados pela plataforma, não do caminho. Um arquivo `.js` pode ser
Nashorn ou frontend.

Um form é um único registro com campos HTML, CSS, JavaScript e, quando criado
pelo designer, XML. Cada chave tem
uma pasta própria e os arquivos internos usam o último segmento da chave como
nome-base. Um form
pode possuir apenas parte desses conteúdos; alguns plugins, por exemplo,
possuem somente JavaScript. Ao salvar uma parte, a publicação reúne os
conteúdos daquela pasta no mesmo payload.

O XML de design contém somente `<fields>` e `<filters>` e é materializado como
`forms/{key}/{nome-base}.xml`. HTML e XML são fragmentos independentes: quando
ambos existem, os dois são baixados, mantidos localmente e enviados no payload
de publicação.

O contrato detalhado do XML e da reconstrução de campos e filtros está em
[`docs/form-design.md`](../docs/form-design.md).

Um form Vue continua sendo um registro de form, mas possui representação local
SFC. Ele fica em `forms-vue/{key}/{DS_FORMULARIO}.vue`. A pasta preserva a
chave técnica cadastrada no ambiente e o arquivo usa o nome funcional do form,
facilitando sua identificação nas abas do editor.

A resposta de download de um form Vue contém a chave, o nome funcional e o
SFC montado:

```json
{
  "key": "module.key.my-form.vue",
  "name": "Meu componente",
  "sfc": "<template>...</template>"
}
```

Regras de materialização:

- `sfc` preenchido: criar somente `forms-vue/{key}/{DS_FORMULARIO}.vue`;
- `sfc` vazio: criar os arquivos HTML, CSS, JS e XML não vazios em `forms/{key}/{nome-base}.{tipo}`;
- `null`, string vazia ou somente espaços: não criar arquivo;
- form somente JavaScript: criar apenas `forms/{key}/{nome-base}.js`.

No download de SFC, o backend faz o join dos campos do registro e retorna o SFC
completo. Na publicação, o servidor local remove as tags externas e envia:

```json
{
  "key": "module.key.my-form.vue",
  "html": "<div>...</div>",
  "css": ".class { ... }",
  "js": "export default { ... }",
  "sfc": null,
  "styleScoped": true
}
```

O extrator aceita um `<template>`, um `<script>` e um `<style>` opcional.
`script setup`, múltiplos estilos e preprocessadores geram erro e impedem a
publicação.

Downloads devem registrar a chave e os metadados retornados pela plataforma.
Arquivos criados somente no workspace não podem ser publicados. Se a chave não
existir no Studio, a API deve retornar erro e nenhuma criação implícita deve
acontecer.

Sources usam `source/`. Forms tradicionais usam uma pasta por chave em
`forms/{key}/`; forms SFC usam `forms-vue/{key}/{DS_FORMULARIO}.vue`.

### Ações no Explorer

O menu de contexto de arquivos em `source/`, `forms/`, `forms-vue/` e
`entities/` oferece:

- `Copy Key`: copia para a área de transferência a chave do source, a chave
  da pasta do form ou o nome físico da entity selecionada;
- `Download/Update`: baixa novamente o mesmo recurso da plataforma usando os
  fluxos normais de download. Para forms, todos os fragmentos retornados são
  atualizados juntos. Para entities, o nome físico é lido do XML selecionado;
- `Publish`: salva buffers modificados e publica manualmente o source ou todos
  os fragmentos existentes do form. Entities não possuem publicação local.

As ações usam o recurso selecionado no Explorer e não exigem que o arquivo
esteja aberto. `Download/Update` substitui os arquivos locais retornados pelo
servidor; alterações locais ainda não publicadas devem ser revisadas antes da
atualização.
A publicação automática é executada pelo servidor local ao salvar. `Publish`
reutiliza o mesmo fluxo do runtime e funciona quando ela estiver desativada.

## Comando disponível

Abra a paleta com `Ctrl+Shift+P` e execute:

`inPaaS: Baixar source`

Informe a chave lógica usada pela plataforma. A API retorna `key` sem extensão,
`type` e `content`; o servidor grava `source/{key}.{type}` e abre o arquivo.

```json
{
  "key": "module.key.source",
  "type": "js",
  "content": "module.exports = {};"
}
```

Ao salvar, o mesmo contrato é enviado para `/api/vs-code/sources/publish`:
`key` sem extensão, `type` (`js`, `css` ou `html`) e `content`.

Execute `node start-local.js` na pasta do projeto e mantenha o terminal aberto. Esse inicializador chama o runtime compartilhado do `inpaas-dev-kit` sem depender da política de execução de PowerShell. `start-local.ps1` permanece como alternativa legada.

Confira o endereço exibido por `Dashboard disponível em ...`: ele deve coincidir com `inpaas.serverUrl` no VS Code (padrão `http://127.0.0.1:8080`). O runtime usa `PLATFORM_PORT` quando definida. Um processo Node ativo, sozinho, não confirma que o proxy está escutando nessa porta.

Se um download não concluir, consulte **Output → inPaaS** para identificar a chave, o projeto escolhido e eventuais erros de conexão. A identificação de projetos aceita `start-local.js` e `start-local.ps1`.

## Download de forms

Execute `inPaaS: Baixar form` e informe a chave cadastrada no Studio. O servidor
consulta `/api/vs-code/forms/{key}` e cria automaticamente as pastas necessárias.

- `sfc` preenchido cria somente `forms-vue/{key}/{DS_FORMULARIO}.vue`; a chave retornada deve
  terminar em `.vue`.
- Sem SFC, HTML, CSS, JS e XML não vazios usam o último segmento da chave como
  nome-base dentro de `forms/{key}/`.
- Conteúdos nulos, vazios ou somente com espaços são ignorados.
- Ao final, a extensão abre todos os arquivos criados.

## Download de entities

Execute `inPaaS: Baixar entity` e informe o nome físico da entidade, por
exemplo `CRM_SM_POST_SCHED`.

A extensão consulta:

`/api/entity-management/entities/{entityName}/xml`

O XML é salvo em `entities/`. Quando a resposta possuir um nome em
`Content-Disposition`, esse nome é usado; caso contrário, o arquivo será
`{entityName}.xml`. Um arquivo existente com o mesmo nome é substituído e o XML
baixado é aberto no editor.

## Navegação por require

Dentro de um arquivo da pasta `source/`, use `Ctrl+clique` ou `F12` sobre a
chave:

```js
var src = require('plusoftcrm.libs.main.source');
```

A extensão procura primeiro um arquivo cujo nome, desconsiderando `.js`,
`.css` ou `.html`, seja igual à chave. Se não encontrar, baixa o source
automaticamente e navega para o arquivo criado. A chave do `require()` deve
permanecer sem extensão.

Também é possível navegar diretamente para métodos:

```js
require('module.key.source').execute();
src.require('module.key.source').execute();

var service = require('module.key.source')();
service.execute();
```

A extensão resolve o método exportado e posiciona o editor em sua implementação.
Se não conseguir localizar a implementação, abre o início do source. Essa regra
continua limitada aos arquivos dentro de `source/` e não navega para entities.

Esse mecanismo também sustenta análises de fluxo: a partir de um source de
entrada, dependências literais em `require()` e `src.require()` podem ser
materializadas progressivamente para acompanhar chamadas entre módulos. A
análise deve reutilizar arquivos já presentes e baixar somente chaves ausentes;
`Download/Update` não deve ser executado automaticamente sobre dependências
locais, pois substitui conteúdo que pode ainda não ter sido publicado.

## Navegação por includes de forms

Em arquivos HTML ou Vue, `Ctrl+clique` ou `F12` sobre uma referência como:

```html
<script src="/includes/module.key.one-checkbox/js/one-checkbox.js?_v={{ form.version }}"></script>
```

abre `forms/module.key.one-checkbox/one-checkbox.js`. A query string de versão
é ignorada. Se o form ainda não existir localmente, a extensão baixa a chave e
abre o fragmento solicitado. O mesmo vale para os segmentos `css` e `html`.

## Executor de queries

Abra a paleta e execute `inPaaS: Nova query`. A extensão abre um documento SQL
usando o editor nativo do VS Code.

- `Ctrl+Enter` ou `F5`: executa a seleção; sem seleção, executa o documento.
- `Shift+Alt+F`: aplica a formatação SQL básica.
- `inPaaS: Executar query`: alternativa pela paleta de comandos.

Os resultados são exibidos no painel inferior do VS Code, com scroll horizontal,
total de registros, tempo de execução, seleção de 10/25/50/100 registros e
paginação no servidor.

## Autocomplete SQL

Em documentos SQL, `Ctrl+Space` sugere tabelas depois de `FROM` e `JOIN`.
Também sugere colunas ao usar uma tabela ou alias:

```sql
SELECT P.
FROM CORE_PATTERN P
```

Os metadados são carregados uma vez por sessão. Execute
`inPaaS: Atualizar metadados do banco` para forçar uma atualização.

## Configurações

- `inpaas.serverUrl`: padrão `http://127.0.0.1:8080`.
- `inpaas.sourceDownloadPath`: padrão `/__platform/source`.
- `inpaas.formDownloadPath`: padrão `/__platform/form`.
- `inpaas.entityDownloadPath`: padrão
  `/api/entity-management/entities/{entityName}/xml`.
- `inpaas.entityDirectory`: padrão `entities`.
- `inpaas.sourceDirectory`: padrão `source`.
- `inpaas.databaseQueryPath`: padrão `/api/studio/dbexplorer/v2/run`.
- `inpaas.databaseMetadataPath`: padrão
  `/api/eai-services/DatabaseExplorerUtils/getTablesHint`.

O servidor usa `SOURCE_AUTO_PUBLISH` e `FORM_AUTO_PUBLISH` para habilitar os
watchers. Os endpoints remotos de publicação são configurados por
`SOURCE_PUBLISH_PATH` e `FORM_PUBLISH_PATH`.

## 0.6.12 — Resultado abaixo do SQL
O resultado abre no grupo abaixo do SQL usando moveEditorToBelowGroup. Execuções seguintes reutilizam o grupo do resultado e o foco retorna ao SQL.
