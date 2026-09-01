# Plataforma inPaaS no workspace local

## Estrutura dos recursos

### Sources

Todos os sources ficam juntos em `source/`:

```text
source/
├── module.key.source.js
├── module.key.template.html
└── module.key.style.css
```

- A chave lógica não possui extensão na plataforma nem no `require()` Nashorn.
- A extensão local é determinada pelo campo `type`: `js`, `css` ou `html`.
- Um `.js` pode ser Nashorn ou JavaScript de frontend; engine e tipo vêm do cadastro do Studio.
- Download: `GET /api/vs-code/sources/{key}`.
- Resposta: `{ "key": "module.key", "type": "js", "content": "..." }`.
- Publicação: `POST /api/vs-code/sources/publish` com o mesmo contrato.
- Excluir um arquivo local nunca publica nem exclui o cadastro remoto.

O `require()` Nashorn usa sempre a chave sem `.js`:

```js
var dependency = require('module.key.dependency');
```

A extensão procura o arquivo local pelo nome sem extensão. Se não encontrar, solicita o download pela chave e navega para o arquivo materializado.

Dentro de `source/`, a navegação por definição também reconhece `src.require()`, chamadas diretas como `require('module.key').method()` e chamadas por variável como `var service = require('module.key')(); service.method()`. Quando o método é identificado, a extensão procura sua exportação e abre diretamente sua implementação; se não a localizar, abre o início do source. Essa análise não é aplicada a entities.

#### Análise de fluxos entre sources

Ao avaliar um comportamento, não limitar a análise ao source inicialmente
indicado. Chamadas com chave literal em `require('...')` e
`src.require('...')` formam dependências navegáveis e podem ser baixadas sob
demanda para reconstruir o fluxo real.

Procedimento para análise assistida:

1. ler integralmente o source de entrada e identificar exports, entradas,
   retornos e efeitos colaterais;
2. levantar as chaves literais usadas em `require()` e `src.require()`;
3. procurar cada dependência primeiro em `source/`, ignorando a extensão local;
4. baixar somente dependências ausentes pelo fluxo normal da extensão ou pelo
   endpoint local equivalente;
5. seguir apenas os métodos e ramos relevantes ao comportamento solicitado;
6. repetir o processo nas dependências necessárias, mantendo um conjunto de
   chaves já visitadas para evitar ciclos;
7. consolidar o encadeamento entre sources, acesso a entities, hooks, queries,
   endpoints e efeitos de gravação antes de propor a alteração.

Um source já existente localmente pode conter trabalho ainda não publicado.
Portanto, analisá-lo como está e não executar `Download/Update` implicitamente.
Atualizar um arquivo existente somente quando o usuário pedir ou quando for
necessário confirmar divergência com a plataforma, deixando claro que o
download substitui seu conteúdo local.

O aprofundamento deve ser orientado pela pergunta, não uma varredura irrestrita
de toda a árvore. Dependências usadas apenas em ramos não relacionados podem ser
registradas sem download. Chaves montadas dinamicamente não podem ser resolvidas
com segurança apenas por análise estática; nesses casos, procurar os valores no
contexto chamador, em configuração ou em dados de execução e declarar a
incerteza quando ela permanecer.

`Java.type()` aponta para classes Java, não para sources, e deve ser investigado
na cópia da plataforma quando afetar o fluxo. Referências frontend em
`/includes/...` apontam para forms/plugins e seguem o mecanismo próprio de
download de forms.

### Forms tradicionais

Um form é um registro da plataforma com campos HTML, CSS e JavaScript. Localmente:

```text
forms/
└── module.key.form/
    ├── form.html
    ├── form.css
    ├── form.js
    └── form.xml
```

- O nome-base dos fragmentos é o último segmento da chave separado por ponto. Exemplo: `onecrmlibs.main.plugins.one-checkbox` gera `one-checkbox.html`, `one-checkbox.css` e `one-checkbox.js`.
- Somente conteúdos não vazios geram arquivos.
- Um form pode conter apenas JavaScript, caso comum para plugins.
- Salvar qualquer fragmento publica o conjunto de fragmentos existentes da pasta.
- Download: `GET /api/vs-code/forms/{key}`.
- Publicação: `POST /api/vs-code/forms/publish`.
- Forms de design usam o fragmento XML para representar exclusivamente `<fields>` e `<filters>`.
- HTML e XML são fragmentos independentes: ambos são baixados e publicados quando estiverem presentes.
- Salvar o XML publica o conjunto completo de fragmentos existentes da pasta, incluindo `html` e `xml`.
- Na publicação do design, uma seção `<fields>` ou `<filters>` presente substitui integralmente a seção correspondente; uma seção presente e vazia limpa seus registros, enquanto uma seção ausente preserva os registros atuais.
- A atualização de HTML, CSS, JavaScript, campos e filtros ocorre na mesma transação quando o payload contém XML.
- O payload possui `key`, `html`, `css`, `js`, `xml` e `sfc`.

Para o esquema XML, round trip, persistência e orientação de alterações, leia
[`form-design.md`](form-design.md).

Para binding com banco, save automático e mestre-detalhe, leia
[`form-data-binding.md`](form-data-binding.md).

### Forms Vue/SFC

Forms Vue continuam sendo forms da plataforma, mas localmente ficam assim:

```text
forms-vue/
└── module.key.component.vue/
    └── Nome funcional.vue
```

No download, `sfc` preenchido cria um arquivo em
`forms-vue/{key}/{DS_FORMULARIO}.vue`. A chave deve terminar em `.vue`; o nome
funcional é usado no arquivo para distinguir as abas do editor. Na publicação
local, a chave é recuperada da pasta e o SFC é desmontado e enviado como
`html`, `css` e `js`, com `sfc: null`.
`styleScoped` informa se o bloco era `<style scoped>`.

O extrator atual suporta um `<template>`, um `<script>` e no máximo um `<style>` opcional. Não suporta `script setup`, múltiplos estilos ou preprocessadores.

### Entities

Entities são baixadas pelo nome físico e armazenadas em `entities/`:

```text
entities/
└── entity-model-crm_sm_post_sched.xml
```

- Download: `GET /api/entity-management/entities/{entityName}/xml`.
- O nome retornado em `Content-Disposition` é usado quando estiver disponível.
- Sem nome na resposta, usar `{entityName}.xml`.
- Um arquivo existente com o mesmo nome é substituído.
- O download não cria nem altera o cadastro da entidade na plataforma.
- No Explorer, `Download/Update` reconhece o XML em `entities/`, obtém o nome
  físico pelo atributo `name` e baixa novamente a entidade.

## Existência obrigatória no Studio

O fluxo local não cadastra recursos. A chave, módulo, engine, pattern, tipo e metadados são definidos no Studio. Um arquivo criado manualmente sem cadastro correspondente deve falhar ao publicar.

## Servidor local e proxy

O runtime é compartilhado em `inpaas-dev-kit/runtime/`. Cada projeto mantém somente um `start-local.ps1`, baseado em `templates/start-local.ps1`, com URL, usuário, senha opcional, porta e opções próprias. Esse arquivo define `PLATFORM_PROJECT_ROOT` e chama o inicializador compartilhado; não deve possuir uma cópia de `server.js`.

Alterações de proxy, download, publicação e resolução local devem ser feitas exclusivamente no runtime do kit para valerem em todos os projetos. O servidor local:

- encaminha `/api`, `/eai`, `/static` e demais endpoints configurados para o ambiente remoto;
- remove expressões Mustache `{{ ... }}` da query string encaminhada e descarta o parâmetro quando o valor ficar vazio;
- adiciona Basic Auth somente no desenvolvimento local;
- mantém o corpo e o `Content-Type` de uploads multipart;
- observa `source/` e `forms/` quando a publicação automática está habilitada;
- resolve `/includes/{form-key}/{js|css|html}/{nome-base}.{tipo}` para o fragmento local correspondente e ignora a query string de versionamento;
- resolve `/forms/{form-key}` para `forms/{form-key}/{nome-base}.html`, permitindo abrir diretamente no navegador um form HTML já baixado;
- ignora a escrita causada por downloads para não publicar imediatamente;
- compara o conteúdo observado com a versão conhecida e só publica sources e forms quando os bytes realmente mudam; leituras, refresh do navegador e eventos espúrios do `fs.watch` não publicam;
- não publica eventos de exclusão.

Variáveis padronizadas:

- `PLATFORM_API_URL`, `PLATFORM_API_USER`, `PLATFORM_API_PASSWORD`, `PLATFORM_PORT`;
- `PLATFORM_PROJECT_ROOT`, apontando para a raiz do projeto servido;
- `INPAAS_DEV_KIT_ROOT`, opcionalmente sobrescrevendo a localização do kit central;
- `SOURCE_AUTO_PUBLISH`, `SOURCE_DOWNLOAD_PATH`, `SOURCE_PUBLISH_PATH`;
- `FORM_AUTO_PUBLISH`, `FORM_DOWNLOAD_PATH`, `FORM_PUBLISH_PATH`.

Senhas são configurações locais e não devem ser copiadas para este kit ou para documentação compartilhada.

## Nashorn

- Código compatível com a engine disponível na plataforma; não pressupor APIs modernas do Node.js.
- Classes Java são acessadas por `Java.type()`.
- Outros sources são carregados pelo `require()` específico da plataforma.
- Objetos enviados ao Knex e às APIs seguem preferencialmente chaves em `snake_case` e minúsculas.
- Nomes físicos de tabelas e colunas podem permanecer em maiúsculas nas queries.
- O Knex da plataforma preenche a PK no próprio objeto após `insert`/`save`; não presumir retorno do insert.
- Objetos usados em campos estruturados são serializados pela camada da plataforma; não aplicar `JSON.stringify` sem necessidade.

## Código-fonte Java de referência

A cópia local atual da plataforma está em:

`C:\Users\tzan\www\platform-java-src-2.7.67-dev`

Ela pode ser consultada para entender classes, queries, entidades e comportamento interno. Não alterá-la sem solicitação explícita do usuário.

## Extensão do VS Code

A extensão compartilhada oferece:

- download de source, form e entity pela paleta;
- navegação por `require()` com download sob demanda;
- publicação automática coordenada pelo servidor local;
- editor e executor SQL paginado;
- autocomplete de tabelas e colunas.

O código-fonte oficial fica em `vscode-extension/` deste kit. Não manter cópias divergentes dentro dos projetos.
