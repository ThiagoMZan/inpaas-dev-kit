# Plugins frontend em projetos legados

## Princípios

- Usar HTML semântico como base. Um combo aprimorado continua partindo de um `<select>` real.
- Plugins reutilizáveis ficam separados da composição da tela.
- A lógica específica de um canal ou domínio permanece no form/source daquele canal.
- Evitar dependência de build quando o projeto será carregado diretamente pela plataforma.
- Preservar jQuery quando esse for o padrão exigido pelo projeto; não introduzir React ou Vue sem decisão explícita.

## Convenção jQuery

Um plugin deve:

- usar IIFE e modo estrito;
- guardar sua instância com `$.data`;
- possuir namespace nos eventos;
- aceitar inicialização por objeto e métodos por string quando necessário;
- expor leitura e escrita de valor de forma previsível;
- emitir eventos para integração sem conhecer o formulário principal;
- preservar acessibilidade, teclado, estado desabilitado e responsividade.

### Nomenclatura

- Componentes realmente genéricos usam `one-*`.
- Componentes ligados ao agendamento de posts usam `one-post-*`.
- Componentes específicos do Google MyBusiness usam `one-gmb-*`.
- O nome do arquivo, o método jQuery, a chave armazenada em `$.data` e os globais públicos devem refletir o mesmo escopo.

Exemplo de interface:

```js
$('#field').oneExample({
  load: function () {
    return $.getJSON('/api/options');
  }
});

$('#field').oneExample('setValue', value);
var value = $('#field').oneExample('value');
```

## Opções por `data-*`

Opções JavaScript em camelCase podem ser declaradas no HTML em kebab-case:

```html
<select data-search-label="Buscar canais" data-allow-clear="true"></select>
```

O atributo é uma alternativa à configuração programática. A configuração explícita do JavaScript deve prevalecer quando ambos forem fornecidos.

## Integração desacoplada

Fluxos específicos devem ouvir e emitir eventos identificados pelo canal. O formulário principal coleta dados e validações sem incorporar os campos internos de cada canal. O mesmo princípio vale para ações de linha, carregamento na edição e persistência via strategies do backend.

Em formulários com conteúdo variável por canal, usar um registro de adapters. O fluxo principal resolve o adapter pela chave do canal e delega montagem, reset, carregamento de dados, dependências, estado somente leitura e integração visual da validação. Ele não deve acessar IDs, propriedades ou plugins específicos do canal.

### JavaScript de form strategy

Em customizações por form strategy, o JavaScript do form principal é somente
leitura. Ele deve ser analisado para entender eventos e ciclo de vida, mas nunca
editado pela spec. O código adicional fica no strategy form ou em uma lib
injetada por ele.

Como forms e componentes podem ser renderizados depois, inclusive em modal,
preferir eventos jQuery delegados e com namespace:

```js
$(document)
  .off('click.customerSpec', '#btn-customer-action')
  .on('click.customerSpec', '#btn-customer-action', function (event) {
    // comportamento da spec
  });
```

Regras para strategies:

- usar um namespace exclusivo da spec em todos os eventos;
- tornar a inicialização idempotente para evitar handlers duplicados em reload,
  modal ou nova renderização;
- delegar a partir do container estável mais próximo; usar `document` somente
  quando não existir ancestral persistente;
- escolher IDs, nomes de fields, roles e classes que façam parte do contrato do
  form, evitando seletores dependentes de posição ou markup incidental;
- tolerar ausência do alvo e encerrar sem erro quando a versão do produto não
  possuir aquele elemento;
- emitir e escutar eventos próprios para integrar componentes, em vez de criar
  acoplamento direto com variáveis internas do JavaScript principal;
- não remover handlers alheios com `.off()` genérico; remover somente o evento
  e namespace pertencentes à spec;
- usar `preventDefault()` e `stopPropagation()` apenas quando a alteração do
  comportamento original for intencional e compreendida;
- preferir APIs públicas de plugins e eventos já emitidos pelo produto. Evitar
  sobrescrever funções globais ou monkey patching; quando inevitável, tratar
  como exceção explícita e documentar compatibilidade e restauração.

Alterações estruturais devem ser feitas pelos component forms da strategy, não
por cadeias extensas de manipulação DOM. jQuery é apropriado para comportamento,
integração e pequenos ajustes dinâmicos; a árvore declarativa continua sendo o
contrato preferencial para inserir ou substituir fields.

## Interface visual

- Seguir os tokens do projeto atual, não criar uma identidade visual global no kit.
- Inputs, combos e botões relacionados devem compartilhar altura, borda e raio.
- Estados de foco, erro, carregamento e desabilitado precisam ser consistentes.
- Componentes com listas extensas devem prever teclado, scroll interno e eventual paginação server-side.

## Localização

- Textos estáticos no HTML de um form usam o bloco Mustache `{{#localization}}chave{{/localization}}`.
- Textos criados dinamicamente em JavaScript usam `window.inpaas.l10n.translate(chave)`.
- Carregar as traduções antes do runtime de localização e ambos antes dos plugins.
- Plugins genéricos devem preferencialmente receber textos já traduzidos em suas opções, sem conhecer chaves específicas do projeto.
- Os valores padrão dos plugins compartilhados One CRM usam o namespace `label.onecrm.*` no módulo de localização `154`; opções fornecidas pela instância continuam prevalecendo sobre esses padrões.
- Chaves de um fluxo devem ser semânticas e compartilhar um prefixo estável, por exemplo `label.postsched.*`.
- Preservar placeholders `{0}`, `{1}` quando a tradução possuir valores dinâmicos.

## Plugins compartilháveis atuais

### `oneMediaUploader`

O uploader compartilhado não deve incorporar limites de um canal. Configure por instância:

- `uploadUrl`, `accept`, `multiple` e `value`;
- `validation`: `acceptedTypes`, `maxFileSize`, `maxImageSize`, `maxVideoSize`, `minImageWidth`, `minImageHeight` e `maxVideoDuration`;
- `validate(file, metadata)` para validação adicional síncrona ou assíncrona;
- `normalize(file, index)`, `responseFiles(response)` e `fieldName(index, file)` para adaptar APIs;
- `labels` e `onError` para textos e apresentação do erro.

Métodos: `value`, `setValue` e `setDisabled`. Eventos: `one:upload-start`, `change` e `one:upload-end`.

### `oneViewSwitcher`

O alternador recebe `views: [{ value, label, icon, disabled }]`, `value`, `ariaLabel` e `onChange`.
Não deve conhecer previamente os nomes das visualizações. Métodos: `value` e `setValue`.
