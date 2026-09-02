# Form Design tradicional

Este documento descreve o contrato local do design de forms tradicionais da
plataforma inPaaS. Ele não se aplica a forms Vue/SFC.

Para binding com entities, save padrão, hooks Nashorn e mestre-detalhe, leia
[`form-data-binding.md`](form-data-binding.md).

Para o fluxo que combina o form de identificação de pessoas, component,
strategy frontend, busca legada e upsert em `CRM_PERSON`, leia
[`corporate-identification.md`](corporate-identification.md).

## Representação local

Cada form já cadastrado no Studio pode possuir HTML, CSS, JavaScript e design
simultaneamente:

```text
forms/
└── module.key.form/
    ├── form.html
    ├── form.css
    ├── form.js
    └── form.xml
```

O XML não substitui o HTML. Os quatro fragmentos são independentes e, quando
existem, são baixados e publicados juntos.

O arquivo XML contém somente o recorte de design do pacote `.form` completo:

```xml
<design>
  <fields>
    <!-- árvore de componentes -->
  </fields>
  <filters>
    <!-- filtros fixos -->
  </filters>
</design>
```

Não adicionar à raiz elementos do pacote completo, como `source-html`,
`source-css`, `source-js`, `libs`, `permission` ou metadados do form. O form de
destino é identificado pela chave do payload, não pelo XML.

## Contrato de download e publicação

O endpoint de form retorna:

```json
{
  "key": "module.key.form",
  "html": "<div>...</div>",
  "css": ".class { ... }",
  "js": "...",
  "xml": "<design>...</design>",
  "sfc": null
}
```

Somente conteúdos não vazios são materializados. O XML é salvo como
`forms/{key}/{nome-base}.xml`. O watcher trata `.xml` como qualquer outro
fragmento do form: ignora a escrita provocada pelo download, detecta alterações
reais e publica novamente todos os fragmentos existentes na pasta.

Na importação do XML:

- `<fields>` presente substitui integralmente os campos atuais;
- `<fields/>` presente e vazio remove todos os campos;
- `<fields>` ausente preserva os campos atuais;
- `<filters>` presente substitui integralmente os filtros atuais;
- `<filters/>` presente e vazio remove todos os filtros;
- `<filters>` ausente preserva os filtros atuais.

HTML, CSS e JavaScript são atualizados normalmente no mesmo payload. Quando há
XML, a atualização textual e a reconstrução do design ocorrem na mesma
transação. XML inválido ou falha de persistência deve provocar rollback.

## Estrutura de fields

`<fields>` contém campos raiz. Containers representam sua hierarquia por meio
de `<children>` aninhados:

```xml
<fields>
  <field fixed="false" name="row-main" type="DIV" visible="true">
    <children>
      <field fixed="false" name="customer-name" type="TEXT" visible="true"
             entity="CRM_CUSTOMER" entity-field="DS_NAME">
        <dependency/>
        <hardcode/>
        <properties>
          <property name="id">customer-name</property>
          <property name="class">form-control</property>
          <property name="required">S</property>
        </properties>
      </field>
    </children>
    <properties>
      <property name="class">row</property>
    </properties>
  </field>
</fields>
```

Atributos JAXB conhecidos de `<field>`:

- `name`: identidade lógica usada também para pais e dependências;
- `type`: tipo definido por `FormFieldType`;
- `visible`: visibilidade persistida;
- `fixed`: uso de layout fixo;
- `left`, `top`, `width`, `height`: coordenadas e dimensões do layout fixo;
- `entity` e `entity-field`: vínculo por nome físico;
- `format`: chave de field format.

Filhos conhecidos:

- `<children><field>...</field></children>`: hierarquia visual;
- `<properties><property name="...">valor</property></properties>`: propriedades do componente;
- `<dependency><depends-on field-name="..."/></dependency>`: dependências por nome lógico;
- `<hardcode><option>...</option></hardcode>`: domínio próprio do campo;
- `<query>...</query>`: query associada, quando suportada pelo componente.

IDs internos e sequência não fazem parte do XML. Na importação, novos IDs são
gerados e a sequência é reconstruída pela ordem da árvore. Por isso nomes de
campos devem ser únicos e estáveis dentro do form. Ao renomear um campo, revisar
dependências que apontem para seu `field-name`.

Tipos atualmente definidos pela plataforma incluem `TEXT`, `COMBOBOX`,
`CHECKBOX`, `TEXTAREA`, `OPTIONBOX`, `LABEL`, `PASSWORD`, `BUTTON`, `IMAGE`,
`HIDDEN`, `IFRAME`, `FILE`, `COMBOBOX_FK`, `DIV`, `TAB`, `MULTISELECT`,
`COMMENT`, `HR`, `WIDGET`, `DATATABLE`, `DATATABLE_COLUMN`, `FORMFILTER`,
`TAB_ITEM`, tipos de gráfico, `HTMLEDITOR`, `FILELIST`, `A`, `P`, `SPAN`,
`SCRIPT`, `UL`, `PRE` e `FORM_INCLUDE`.

No XML JAXB, `type` usa o nome da constante Java de `FormFieldType`, não sua
descrição exibida pelo Studio. Assim, usar `COMBOBOX_FK`, `DATATABLE_COLUMN`,
`TAB_ITEM`, `HTMLEDITOR`, `FILELIST` e `FORM_INCLUDE`; valores descritivos como
`COMBOBOX-FK` são desserializados com tipo nulo nesta versão e falham ao salvar.

As propriedades válidas dependem do tipo, das extensões instaladas e da versão
da plataforma. Não inventar propriedades apenas pela semelhança com HTML.
Preservar propriedades desconhecidas e usar forms exportados e o código Java
da versão local como referência.

## Estrutura de filters

Um filtro possui `name`, `label`, `query-key` e `default`. Ele pode conter
critérios e ordenação:

```xml
<filters>
  <filter default="true" name="Ativos" label="customer.active">
    <criterias>
      <criteria entity="CRM_CUSTOMER" entity-field="DO_ACTIVE"
                logic="AND" condition="EQUAL" value="S"/>
    </criterias>
    <ordination>
      <order entity="CRM_CUSTOMER" entity-field="DS_NAME" orderBy="ASC"/>
    </ordination>
  </filter>
</filters>
```

Entidades e campos são resolvidos por seus nomes durante a importação. Valores
de `logic`, `condition` e `orderBy` precisam corresponder aos enums aceitos pela
versão da plataforma. Um export sem filtros persistidos pode conter o filtro
padrão sintético `<filter default="false" name="Todos"/>`.

## Persistência na plataforma

O download reutiliza `PackageManagerBusinessDelegate.exportForm(id)` e o
marshaller de `PackageTypeEnum.FORM`, extraindo somente `<fields>` e
`<filters>`.

A publicação não usa `installFormPackage()` diretamente. Um pacote parcial
passado ao instalador completo pode apagar e recriar o form, perdendo dados não
presentes no XML. O fluxo parcial:

1. valida `<design>` e rejeita elementos inesperados, DTD e entidades externas;
2. converte temporariamente a raiz para `<form>` e desserializa com o marshaller nativo;
3. carrega o form existente pela chave;
4. remove recursivamente os campos da seção que será substituída;
5. recria campos, filhos, propriedades, dependências e domínios;
6. substitui filtros, critérios e ordenação;
7. executa tudo em `JdbcEntityDataSession`.

Classes reutilizadas:

- `FormBusinessDelegate`;
- `FormFieldBusinessDelegate`;
- `FixedFilterBusinessDelegate`;
- `MarshallerFactory` com `PackageTypeEnum.FORM`;
- `JdbcEntityDataSession`.

As principais entidades físicas afetadas são `CAMPOFORMULARIO`, propriedades,
dependências e domínios de campos, além das entidades de filtro, critérios e
ordenação. HTML, CSS, JavaScript, libs, permissões e demais metadados não são
alterados pelo importador de design, exceto os fragmentos textuais enviados
explicitamente no mesmo payload.

## Orientação para alterações assistidas

Antes de propor uma mudança no XML:

1. ler o arquivo completo e identificar a árvore de containers;
2. localizar exemplos existentes do mesmo `type` no workspace;
3. preservar nomes, vínculos, propriedades e seções não relacionadas;
4. preferir uma alteração pequena e verificável;
5. alertar quando um tipo ou propriedade ainda não tiver comportamento confirmado;
6. recomendar teste inicial em form descartável quando a mudança reconstruir campos ou filtros.

Não assumir que aparência visual depende apenas do XML: CSS, JavaScript, libs e
includes do form podem participar do comportamento final.

## Geração de campos a partir de colunas

Quando uma solicitação pedir campos com base em colunas de uma entity, usar a
geração de edição da própria plataforma como referência. A implementação da
versão `2.7.67-dev` está em `FormWizard.generateEditForm()`, que delega para
`EditFormGenerator`. A geração de form de listagem não define este padrão.

Antes de alterar o XML, ler na entity baixada, para cada coluna solicitada:

- nome físico, tipo e tamanho;
- obrigatoriedade e chave primária;
- valor default;
- domínio de valores;
- referência de chave estrangeira e entity referenciada.

O wizard representa cada coluna como uma árvore completa, não somente como o
input:

1. um `DIV` de linha, visível, com classe `row`;
2. um `DIV` para o label, com classe `col-xs-12 col-sm-6 col-md-3`;
3. um `LABEL` com `text` e `for`;
4. um `DIV` para o input;
5. o componente de entrada ligado por `entity` e `entity-field`.

A coluna do input usa `col-xs-12 col-sm-3 col-md-2 col-lg-2` para chave
primária e `col-xs-12 col-sm-6 col-md-5` para as demais colunas. O `name`, o
`id` do input e o `for` do label seguem:

```text
input-{entity}-{column}
```

O valor é convertido para minúsculas. Exemplo:
`input-crm_person-ds_person`.

### Label gerado

A chave de tradução do label segue esta prioridade:

- chave primária: `label.id`;
- coluna `DO_INACTIVE`: `label.inactive`;
- chave estrangeira: `label.{referenced_entity}`;
- demais colunas: `label.{entity}.{column}`.

Todas as chaves são convertidas para minúsculas. O label usa a propriedade
`text`; `title` no input não substitui esse componente visual.

### Escolha do componente

Para uma coluna com referência:

- referência a `CORE_FILE`: `FILE`, classe `input-file` e
  `text=label.input.fileupload`;
- qualquer outra referência: `COMBOBOX_FK`, classe
  `form-control input-sm`.

Para uma coluna sem referência, o wizard calcula estas condições e aplica a
primeira correspondente na ordem abaixo:

1. domínio de até dois itens cujo primeiro valor seja booleano para
   `BooleanUtils`: `CHECKBOX`, classe `checkbox checkbox-default`;
2. valor default iniciado por `$`: `LABEL`;
3. qualquer outro domínio não vazio: `COMBOBOX`, classe
   `form-control input-sm`;
4. `VARCHAR` ou `NVARCHAR` com tamanho `-1`: `TEXTAREA`, classe
   `form-control input-sm` e estilo `min-height: 130px; `;
5. caso restante: `TEXT`, classe `form-control input-sm` e `maxlength`
   quando o tamanho for não negativo e diferente de `Integer.MAX_VALUE`.

A ordem é relevante. Por exemplo, um default iniciado por `$` prevalece sobre
um domínio não booleano, mas um domínio booleano prevalece sobre esse default.
Tipos `DATE`, `DATETIME`, numéricos e `CHAR` sem domínio caem em `TEXT` no
wizard desta versão; comportamento visual adicional pode vir de field formats
ou customizações e não deve ser presumido.

O wizard desta versão não atribui automaticamente um `format` com base no tipo
físico. Quando a solicitação exigir formatação e o significado da coluna for
inequívoco, um campo `TEXT` pode usar os formatos core, por exemplo
`format="fieldformat.date"` para uma data sem horário ou
`format="fieldformat.datetime"` para data e horário. O formato temporal faz o
renderer publicar máscara e validação de data e faz o save interpretar o texto
com o formatter localizado. Não escolher entre data e data/hora somente pelo
tipo `DATETIME`: considerar o alias, o nome e o uso funcional da coluna; pedir
confirmação quando houver ambiguidade.

Depois de escolher o tipo, o wizard sempre define `entity` e `entity-field`.
Chaves primárias recebem `readonly=Y`. Para as demais, colunas obrigatórias
recebem `required=Y`.

O wizard não copia o domínio da entity para o `hardcode` do campo. Para
`COMBOBOX` vinculado, o renderer `Select` procura primeiro um domínio próprio
do form e, quando ele não existe, usa o domínio da coluna da entity. Portanto,
não duplicar opções no XML por padrão; usar `hardcode` somente quando o form
precisar sobrescrever ou possuir opções próprias. Preservar um `hardcode` já
existente durante alterações que não tratem explicitamente do domínio.

Essas regras são o ponto de partida para pedidos baseados em colunas. O layout
existente do form ainda deve ser respeitado: reutilizar containers compatíveis
quando isso mantiver o padrão visual, sem reconstruir o form inteiro como o
wizard faria para um cadastro novo.

Os arquivos estáticos core devem ser consultados diretamente no co-workspace
da plataforma. Assets adicionais ou divergentes e suas origens são catalogados
em [`../references/platform-form-runtime/ORIGIN.md`](../references/platform-form-runtime/ORIGIN.md).

## Renderização em `/forms`

Na plataforma Java, forms tradicionais são atendidos por `FormController`,
registrado em `/forms` e `/forms/*`.

### Fichas somente leitura com pattern

Um form HTML usado como ficha pode manter `<fields/>` vazio e montar seus dados
no `beforeRender` do `DynaFormBusinessDelegate`. O registro selecionado costuma
chegar no `TO data` pela PK física em minúsculas; quando a entity também define
um alias para a PK, um pattern reutilizável pode tolerar ambos explicitamente.

O contrato recomendado é manter consulta e apresentação separadas:

1. ler a PK recebida pelo `beforeRender`;
2. consultar o registro principal;
3. consultar as coleções relacionadas pela chave física ou lógica definida no
   projeto;
4. formatar datas e valores de domínio no backend;
5. publicar objetos com `data.put(...)` para o Mustache apenas apresentar.

Quando o projeto adotar Knex, finalizar consultas de coleção com `.find()` e
consultas unitárias com `.first()`. Não confundir relacionamento lógico com FK:
uma lista histórica pode ser obtida por um código legado compartilhado mesmo
quando a entity não declara referência física.

Para conteúdo textual legado, não recorrer a Mustache sem escape apenas para
preservar `<br>`. É mais seguro normalizar essas tags para `\n` no pattern e
renderizar com Mustache comum dentro de um elemento com
`white-space: pre-wrap`.

### Form strategy do produto

Neste ecossistema, **form strategy** identifica a extensão de forms implementada
pelo source `plusoftcrm.libs.pattern.strategy`. Ela permite manter alterações
e specs fora do form e do pattern base do produto, reduzindo conflito quando o
produto é atualizado. Não confundir esse mecanismo com o pattern Nashorn
nativo: a strategy é uma convenção adicional chamada explicitamente por alguns
patterns.

#### Regra de imutabilidade do produto

Quando um form possui suporte a strategy, o form principal é **somente
leitura**. Não modificar nenhum de seus fragmentos (`html`, `css`, `js` ou
`xml`) para implementar a customização e, especialmente, não alterar seu
JavaScript. O mesmo princípio se aplica ao pattern principal do produto: ele é
referência para compreender o fluxo, não o local da spec.

Toda alteração deve ficar nos recursos de extensão apropriados:

- form `.strategy%` para fields adicionais e assets;
- form `.component%` para inserir, estender ou substituir fields;
- pattern/source `.strategy.%` para hooks de business encaminhados;
- libs independentes registradas pela strategy, quando compartilhadas.

Essa separação existe para que a atualização do produto possa substituir o form
e o pattern principais sem apagar a spec. Se o ponto de extensão disponível não
for suficiente, explicar a limitação; não contorná-la editando silenciosamente
o recurso base.

Um pattern compatível, como
`plusoftcrm.ticket.pattern.forms.ticket.edit`, normalmente:

1. verifica a presença do módulo `plusoftcrm.libs.main`;
2. chama `plusoftcrm.libs.pattern.strategy.addForm(form)` enquanto o source do
   pattern está sendo avaliado;
3. cria seu `DynaFormBusinessDelegate` normal;
4. encaminha hooks escolhidos para
   `plusoftcrm.libs.pattern.strategy.executeAction(event, args)`.

Esse encaminhamento não é automático. Cada hook precisa possuir uma chamada no
pattern. No exemplo de ticket edit, somente `beforeRender` e `afterRender` são
encaminhados. Embora a lib saiba despachar `beforeSet` e `afterSet`, eles não
executam nesse pattern enquanto ele não os encaminhar explicitamente.

#### Convenções de chave

A chave usada pela strategy é `form.getKey()`, não a chave do pattern que
instancia o delegate. Para um form `{formKey}`, existem dois grupos distintos:

- forms `{formKey}.strategy%`: campos adicionais e assets CSS/JavaScript;
- forms `{formKey}.component%`: inserção, extensão ou substituição de campos;
- source opcional `{formKey}.strategy`: business strategy base;
- registros de `CORE_PATTERN` com `DS_KEY LIKE
  '{formKey}.strategy.%'`: business strategies adicionais, tratadas como specs.

Forms filhos são descobertos em `FORMULARIO`, ordenados por `DS_KEY`, e
carregados por `HTMLRenderContext.Builder.withForm(key).build().getForm()`.
Business strategies adicionais também são ordenadas por `DS_KEY`. A ordem das
chaves pode, portanto, afetar composição e execução.

#### Composição da árvore

`addForm(form)` altera a árvore de `FormField` em memória antes da renderização:

- cada campo raiz de um form `.strategy%` é acrescentado ao form original;
- um campo raiz de `.component%` com `role=before.{targetName}` é inserido antes
  do field alvo entre os filhos de seu pai;
- com `role=after.{targetName}`, é inserido depois do alvo;
- sem esses roles, o nome do component field identifica o field original;
- com `role=children`, seus filhos são anexados ao field original;
- nos demais casos, o component field substitui o original na mesma posição;
- nomes retornados por `componentField.getDepends()` são buscados no próprio
  component form e inseridos no início do mesmo container antes da composição.

Se o alvo, seu pai ou a posição entre os filhos não for encontrado, os fluxos
`before`/`after` ignoram o componente. Na composição por nome, o component
também é ignorado quando não existe field original correspondente. Nomes de
fields e relações de pai são, portanto, parte do contrato entre o produto e a
spec.

#### Hooks de business

`executeAction()` obtém o form de `args.form` ou de `args.renderContext`. Para
`beforeRender`, `beforeSet` e `afterSet`, executa nesta ordem:

1. o método homônimo exportado pelo source opcional
   `{formKey}.strategy`;
2. o método homônimo de cada pattern `{formKey}.strategy.%` encontrado em
   `CORE_PATTERN`, em ordem de chave.

Os sources adicionais são invocados por `plusoftcrm.libs.main.require`, que só
chama o método quando ele existe. Os argumentos são o objeto único `args`
montado pelo pattern adaptador; a spec deve respeitar o conteúdo fornecido por
cada hook. Alterações de `beforeSet` continuam sujeitas ao contrato de mutação
do `TO` descrito em `form-data-binding.md`.

#### Injeção de JavaScript e CSS

No início de `beforeRender`, a lib inicializa o storage compartilhado
`libs.forms`. Outros sources podem registrar uma lib com
`plusoftcrm.libs.main.source().storage().addFormLib(formKey)`.

Em `afterRender`, o comportamento depende do header `X-Requested-With`:

- página normal: injeta ao final do HTML um `<script defer>` para cada form de
  `libs.forms`; para cada form `.strategy%`, injeta seu CSS em `<style>` e um
  `<script defer>` por `/includes/{strategyFormKey}/js/inpaas-form.js`;
- modal (`XMLHttpRequest`): não injeta esses elementos no HTML; concatena o
  `sourceJs` de cada strategy form ao `sourceJs` do form original.

Os includes recebem `_v` com UUID aleatório para evitar cache. No código desta
versão, o nome do arquivo incluído é fixo como `inpaas-form.js`. CSS de strategy
não é acrescentado pelo ramo modal. Ao diagnosticar diferenças entre abertura
normal e modal, verificar primeiro essa bifurcação.

O `afterRender` retorna `args.htmlString`, permitindo que o pattern devolva o
HTML enriquecido. No exemplo de ticket edit, ele preserva o HTML original se a
strategy não retornar valor.

#### Orientação para alterações

Quando o usuário mencionar **form strategy**, analisar em conjunto:

- o form base e sua árvore de fields;
- o pattern que instancia o `DynaFormBusinessDelegate` e quais hooks encaminha;
- `plusoftcrm.libs.pattern.strategy`;
- forms `{formKey}.strategy%` e `{formKey}.component%` existentes;
- source `{formKey}.strategy`, quando existir;
- patterns `{formKey}.strategy.%` cadastrados em `CORE_PATTERN`;
- libs registradas em `libs.forms` e os assets incluídos no frontend.

Preferir implementar uma spec/strategy quando o objetivo for customizar um form
de produto sem alterar seu recurso base. Confirmar primeiro quais pontos de
extensão o pattern daquele form realmente encaminha; a existência da lib por si
só não torna todos os hooks disponíveis.

No frontend, ler o JavaScript principal para descobrir seletores, eventos e
ciclo de vida, mas implementar o comportamento exclusivamente no JavaScript do
strategy form ou de uma lib carregada por ele. Aplicam-se as convenções de
eventos descritas em `frontend-plugins.md`.

Formatos principais de URL:

```text
/forms/{form-key}
/forms/{form-key}/{record-id}
```

O primeiro segmento pode ser uma chave ou ID aceito por
`FormBusinessDelegate.get()`. O segundo segmento identifica o registro. Um ID
de registro não numérico é interpretado como hexadecimal e descriptografado
com o cipher `record-id`, usando a identificação do form como contexto.

Antes de renderizar, o controller:

1. desabilita cache HTTP da resposta da página;
2. resolve o `Form` pela URL;
3. carrega fields, filtros, libs, entidade, pattern e demais metadados;
4. valida sessão para forms que não permitem acesso anônimo;
5. registra o acesso ao recurso;
6. monta o mapa de permissões do form;
7. converte query string e parâmetros da requisição em um `TO`.

O método HTTP define a operação:

- `GET`: carrega dados e renderiza HTML;
- `POST`: insere um registro pela entidade vinculada;
- `PUT`: usa o mesmo fluxo de gravação do `POST`, normalmente com record ID;
- `DELETE`: remove o registro informado.

Permissões são verificadas por operação: `VIEW`, `INSERT`, `UPDATE` e
`DELETE`. Um form anônimo dispensa usuário autenticado, mas continua sujeito ao
restante do fluxo aplicável.

### Resolução e cache do form

Quando o cache de forms da instância está ativo, o controller procura primeiro
na coleção de cache `forms`, usando o identificador recebido na URL. Em cache
miss, `FormBusinessDelegate` carrega o registro e chama
`loadFormFields(form, false)`; o objeto completo é então armazenado no cache.

Esse cache contém a árvore de fields. Portanto, após publicar mudanças de
design diretamente pelos delegates, uma instância com cache habilitado pode
continuar renderizando a árvore anterior até a entrada ser invalidada ou o
cache expirar/ser limpo. O fluxo atual de publicação via
`inpaas.studio.vscode.utils` não possui invalidação explícita desse cache.

### Dados usados no GET

Em `/forms/{key}` sem record ID, os parâmetros da requisição são usados como
dados iniciais. Em `/forms/{key}/{record-id}`, o
`DynaFormBusinessDelegate.get(id)` busca a entidade principal e depois mescla
os parâmetros da requisição sobre o registro carregado.

Quando o form possui um source/pattern Nashorn vinculado,
`DynaFormBusinessDelegateFactory` executa esse source com `form` nos bindings e
obtém uma implementação especializada de `DynaFormBusinessDelegate`. Ela pode
customizar hooks como `beforeGet`, `afterGet`, `beforeRender`, `afterRender`,
`beforeSet` e `afterSet`.

No modo normal, `beforeRender(context, data)` roda antes da árvore. Em modo de
design ele é deliberadamente ignorado. `afterRender(context, formData,
designerHtml)` pode alterar o HTML produzido em ambos os casos.

### HTMLRenderContext e ações

O controller constrói um `HTMLRenderContext` com:

- contexto da requisição;
- form e campo opcional;
- business delegate padrão ou Nashorn;
- mapa de permissões;
- filtro fixo selecionado;
- dados e bindings;
- ação e template HTML.

As ações existentes são:

- `OPEN`: renderização normal do form completo;
- `DESIGN`: visualização do Studio, ativada por `?design=auto`;
- `FILTER`: renderização parcial de um componente;
- `RELOAD`: ação disponível no modelo, usada por fluxos específicos.

Com `?design=auto`, o controller usa o template de design, ignora a validação
de `VIEW` naquele bloco e instancia o delegate Java padrão para não executar o
source Nashorn server-side do form. Esse modo também evita carregar as libs
específicas do form; permanecem as libs core.

Quando há o parâmetro `filter`, a ação passa a `FILTER`, o campo indicado é
localizado pelo ID e somente essa subárvore é renderizada. `fixedfilter` pode
selecionar um filtro específico do form.

### Seleção do template

Na ação normal, a precedência é:

1. `source-html` do próprio form, quando preenchido;
2. template Ajax para requisições Ajax;
3. apenas `{{& designer-html }}` para requisições Angular;
4. template de página completa para as demais requisições.

O XML nunca é devolvido diretamente ao navegador. Ele já foi convertido em
objetos `FormField`; a saída recursiva desses objetos é inserida no binding
Mustache `designer-html`. Se o form possui HTML próprio, esse HTML funciona
como template e precisa posicionar `{{& designer-html }}` onde a árvore gerada
deve aparecer. Sem esse placeholder, os fields podem existir e ser processados,
mas não aparecem na saída final.

Bindings relevantes fornecidos ao template:

- `form`: modelo e metadados do form;
- `data`: registro ou parâmetros de entrada;
- `form-data`: dados produzidos pelos renderizadores;
- `designer-html`: HTML gerado pela árvore de fields;
- `jsdata` e `jsformdata`: versões JSON dos dois conjuntos de dados;
- `permissions`: nomes das permissões concedidas;
- `localization`: serviço de tradução;
- `include-css` e `include-js`: arquivos das libs;
- `include-html`: função para processar HTML de outro form;
- `postpath`: URL usada na submissão;
- `assets-base-url` e `assets-random-id`: resolução/versionamento de assets.

### Renderização recursiva dos fields

`DynaFormBusinessDelegate.render()` executa duas fases:

1. `HTMLForm.renderHTMLForm()` produz `designer-html` e `form-data`;
2. `renderTemplate()` aplica Mustache ao template selecionado.

`HTMLForm` percorre os fields raiz na ordem persistida. Para cada field,
`HTMLRendererLocator` escolhe um renderer conforme `FormFieldType`. Containers
renderizam `<children>` recursivamente. Exemplos de resolução:

- `TEXT` e `PASSWORD` usam renderer de input;
- `CHECKBOX` usa checkbox;
- `COMBOBOX`, `COMBOBOX_FK`, `FORMFILTER` e `MULTISELECT` usam select;
- `DIV` e tipos sem renderer dedicado usam o elemento padrão;
- `WIDGET`, `TAB`, `TAB_ITEM`, `DATATABLE` e `DATATABLE_COLUMN` possuem renderizadores próprios;
- fields de arquivo, charts, iframe, editor HTML e form include possuem lógica especializada.

O renderer base adiciona `form-field-id`, converte propriedades XML elegíveis
em atributos HTML, traduz propriedades marcadas como labels, normaliza classes,
resolve booleanos e acrescenta `depends` com os IDs dos campos de dependência.
Field formats podem gerar máscara e regras de data, número ou e-mail.

Em layout fixo, o elemento recebe wrappers com posição absoluta baseada em
`left`, `top`, `width` e `height`. Em layout comum, a hierarquia e propriedades
como `class` determinam a composição visual.

Valores vêm do registro conforme os vínculos `entity` e `entity-field`. Em
modo `DESIGN`, o renderer usa placeholders como `${ nome-do-campo }` em vez do
valor real. Selects, tabelas, charts e outros componentes podem executar queries
ou aplicar critérios, filtros fixos e dependências durante a renderização.

### Template final e includes

O template de página completa cria a tag `<form>` com chave, ID, permissões e
`postpath`, injeta `designer-html`, carrega libs core, libs declaradas pelo form,
localização e scripts padrão. CSS e JavaScript próprios são servidos por:

```text
/includes/{form-key}/css/inpaas-form.css
/includes/{form-key}/js/inpaas-form.js
```

O include de CSS concatena CSS dos módulos da aplicação com o CSS do form. O
include de JavaScript entrega o JavaScript do form. Esses endpoints usam cache
HTTP público de duas horas e os templates acrescentam parâmetros de versão.

O template Ajax retorna um fragmento `<form>` e inclui o JavaScript próprio de
forma inline. O template de design carrega estilos e scripts do Studio e não as
libs específicas do form.

### Diferença no runtime local

O runtime do `inpaas-dev-kit` intercepta `/forms/{form-key}` e, quando encontra
um HTML local, devolve diretamente
`forms/{form-key}/{nome-base}.html`. Esse atalho não executa
`FormController`, `HTMLRenderContext`, o source Nashorn server-side nem os
renderizadores Java do XML.

Assim, a rota local é adequada para forms cujo HTML já representa a interface,
mas não é uma prévia fiel de um form baseado em Form Design. Para validar a
renderização real do XML, acessar a rota da plataforma/proxy que alcance o
`FormController`, levando em conta autenticação, permissões e cache.
