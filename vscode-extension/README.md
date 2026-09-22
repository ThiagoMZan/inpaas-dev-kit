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
[`form-design.md` na base de conhecimento](https://github.com/ThiagoMZan/inpaas-ai-knowledge/blob/main/docs/form-design.md).

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
  atualizados juntos. Para entities, o nome físico é lido do modelo JSON selecionado;
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

## Studio dentro do VS Code

Execute `inPaaS: Studio` para abrir o form do Studio em uma aba do editor. A
aba usa `inpaas.serverUrl` e o caminho configurado em `inpaas.studioPath`, cujo
valor padrão é:

`/forms/inpaas.devstudio.forms.studio/`

## Barra lateral inPaaS

A extensão adiciona o ícone **inPaaS** à Activity Bar. A view **Módulo ativo**
permite selecionar, pela API local `GET /api/studio/apps`, um módulo do
ambiente configurado para cada projeto do workspace. A seleção guarda o `id`,
a chave e o título do módulo no estado do workspace, separado também pela URL
do ambiente, e será usada pelos fluxos
que dependem de contexto de módulo, como criação de forms, sources e labels.

O container lateral chama-se **inPaaS** e possui as views nativas **Module**,
**Forms**, **Sources**, **Entity**, **Database** e **Studio**, separadas visualmente como no Containers do Docker. O
título de **Module** mostra o módulo selecionado e seu conteúdo é **Select**;
**Forms** e **Sources** contêm **New** e **Download**; **Database** contém
**New Query**; **Entity** contém **Download**; e **Studio**, exibido depois de
**Database**, contém **Open**. Os comandos continuam disponíveis na Paleta de
Comandos.

Ao abrir o Studio pelo VS Code, a extensão envia o `id` do módulo ativo na
URL. O Studio prioriza esse valor em relação ao módulo salvo no `localStorage`,
desde que o módulo ainda esteja disponível no ambiente, e então o persiste para
as próximas aberturas.

O botão **Novo Form v1** abre duas etapas nativas: a chave, iniciada por
`{chave-do-módulo}.forms.`, e o nome exibido, sugerido pelo último segmento da
chave e livre para edição. A extensão cria o form em
`POST /api/studio/modules/{moduleId}/forms` com o `id` do módulo ativo, baixa
o recurso e abre os fragmentos locais resultantes.

**Novo Source** primeiro seleciona o tipo, depois solicita a chave iniciada
por `{chave-do-módulo}.` e, por fim, o nome exibido. Para `REST Service`, o
nome sugerido é o último segmento da chave; para os outros tipos, segue a
convenção do Studio de converter os segmentos em PascalCase e remover os
pontos. A criação usa `POST /api/studio/sources` com o `id` do módulo ativo,
baixa e abre o source resultante.

O runtime encaminha esse form para o ambiente remoto usando a mesma
autenticação configurada para o proxy local. A aba é reutilizada enquanto
estiver aberta; sources, forms e outros arquivos continuam sendo editados pelo
fluxo local normal.

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

A extensão consulta `GET /api/vs-code/entities/{entityName}` e
`GET /api/vs-code/entities/{entityName}/labels`, salvando o modelo retornado
como `entities/{entityName-em-minúsculas}.entity.json`. As labels são lidas
diretamente de `CORE_LABEL` pela chave global, sem depender de módulo. Esse é o
formato local do editor visual e contém a estrutura completa da entity.

O download e o save são locais. Nenhuma entity, label ou vínculo de form é
publicado por save, watcher ou IA; a publicação será
um comando manual explícito.

## Navegação por require

Dentro de um arquivo da pasta `source/`, use `Ctrl+clique` ou `F12` sobre a
chave:

```js
var src = require('plusoftcrm.libs.main.source');
```

A extensão procura primeiro um arquivo cujo nome, desconsiderando `.js`,
`.css` ou `.html`, seja igual à chave. Se não encontrar, baixa o source
automaticamente e navega para o arquivo criado. A chave do `require()` deve
permanecer sem extensão, exceto quando o sufixo fizer parte da própria chave
cadastrada.

Também é possível navegar diretamente para métodos:

```js
require('module.key.source').execute();
src.require('module.key.source').execute();

var service = require('module.key.source')();
service.execute();
```

Quando o factory atribuído a uma variável recebe aliases, a navegação resolve o
valor mapeado — e não o nome do alias — antes de procurar ou baixar o source:

```js
var src = require('plusoftcrm.libs.main.source')({
  'VSCodeUtils': 'inpaas.studio.vscode.utils'
});

src.require('VSCodeUtils').publishSource(args);
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
- `inpaas.studioPath`: padrão
  `/forms/inpaas.devstudio.forms.studio/`.
- `inpaas.sourceDownloadPath`: padrão `/__platform/source`.
- `inpaas.formDownloadPath`: padrão `/__platform/form`.
- `inpaas.entityDirectory`: padrão `entities`.
- `inpaas.sourceDirectory`: padrão `source`.
- `inpaas.databaseQueryPath`: padrão `/api/studio/dbexplorer/v2/run`.
- `inpaas.databaseMetadataPath`: padrão
  `/api/eai-services/DatabaseExplorerUtils/getTablesHint`.

O servidor usa `SOURCE_AUTO_PUBLISH` e `FORM_AUTO_PUBLISH` para habilitar os
watchers. Os endpoints remotos de publicação são configurados por
`SOURCE_PUBLISH_PATH` e `FORM_PUBLISH_PATH`.

## 0.6.18 — Módulo ativo

Adicionada a view `inPaaS` na Activity Bar para escolher e persistir o módulo
ativo por projeto e ambiente.

## 0.6.20 — Novo Form v1

Adicionado o comando `inPaaS: Novo Form v1`, disponível nas ações do módulo
ativo na view inPaaS. Ele exige módulo ativo, cria pelo contrato do Studio e
baixa o form automaticamente para edição local.

## 0.6.21 — Ações do módulo

As ações do módulo ativo foram movidas do cabeçalho para dentro da view
**Módulo ativo**.

## 0.6.22 — Navegação em árvore

A view inPaaS passou a separar módulo e forms em grupos expansíveis, seguindo
o padrão de listas da barra lateral do VS Code.

## 0.6.23 — Ajustes da navegação

O Studio voltou a ser uma ação isolada no cabeçalho; os grupos principais não
exibem ícones nem a chave do módulo.

## 0.6.24 — Rótulos das ações

As ações da árvore usam rótulos curtos em inglês: **Select**, **New** e
**Download**.

## 0.6.25 — Views nativas

Module e Forms passaram a ser views separadas, reproduzindo os separadores e a
ausência de guias de indentação do layout do Containers.

## 0.6.26 — Studio na barra lateral

Studio deixou de ser uma ação no cabeçalho de Module e passou a ser uma view
própria, exibida depois de Forms, com a ação **Open**.

## 0.6.27 — Sources na barra lateral

Adicionada a view **Sources**, com as ações **New** e **Download**. A criação
reproduz as sugestões de chave e nome do template do Studio e usa o módulo
ativo.

## 0.6.28 — Contexto de módulo no Studio

O comando de abrir Studio passa o módulo ativo da extensão para o Studio, que o
seleciona antes de consultar o valor persistido no `localStorage`.

## 0.6.29 — Database na barra lateral

Adicionada a view **Database** entre **Sources** e **Studio**, com a ação
**New Query**, que reutiliza o editor SQL já existente.

## 0.6.30 — Entity na barra lateral

Adicionada a view **Entity** entre **Sources** e **Database**, com a ação
**Download**, que reutiliza o download de entity existente.

## 0.6.31 — Ícone code

O ícone da Activity Bar do inPaaS passou a usar o Codicon **code**, alinhado ao
ícone do Studio.

## 0.6.33 — Entity Editor v1

A view **Entity** ganhou **Open Editor**, que abre um modelo `.entity.json`
já baixado em uma aba visual. O save grava somente no workspace; entities não
possuem publicação automática nesse fluxo.

## 0.6.34 — Editor visual de entity

**Open Editor** abre o form local `inpaas.devstudio.entity-vs-code.main` no
Webview e troca o modelo JSON por uma ponte de mensagens. O save grava somente
o JSON no workspace.

## 0.6.12 — Resultado abaixo do SQL
O resultado abre no grupo abaixo do SQL usando moveEditorToBelowGroup. Execuções seguintes reutilizam o grupo do resultado e o foco retorna ao SQL.
