# Fichas HTML somente leitura

Este documento define o padrão reutilizável para fichas de consulta tradicionais
renderizadas por um form HTML e alimentadas por um pattern Nashorn. O modelo foi
validado a partir de fichas do produto que usam Mustache, tabelas de apresentação
e `DynaFormBusinessDelegate`.

## Terminologia de solicitação

Quando o usuário mencionar **"template de ficha de atendimento"**, interpretar
essa expressão como referência ao padrão completo descrito neste documento:
arquitetura de form HTML somente leitura com pattern, dados preparados no
`beforeRender`, apresentação Mustache e o contrato visual tradicional da ficha.

Essa interpretação inclui tipografia, cores, cabeçalhos com imagem, ausência de
divisões horizontais e proporções das colunas de dados. Se o usuário indicar
explicitamente outro form ou template como referência, a referência informada
na solicitação prevalece.

Use este padrão quando a tela apenas apresenta um registro recebido por parâmetro.
Para edição e persistência automática, seguir `form-design.md` e
`form-data-binding.md`.

## Recursos e limites

- O form e o pattern precisam existir previamente no Studio.
- Baixar os dois recursos antes de alterá-los.
- Um form de produto usado como referência é somente leitura. Copiar apenas o
  padrão necessário para o form próprio; não publicar mudanças no recurso base.
- Preservar todos os fragmentos existentes do form ao publicar, mesmo quando a
  alteração ocorrer somente no HTML.
- O XML da ficha pode manter `<fields/>` vazio, pois os dados são preparados no
  `beforeRender` e apresentados pelo template HTML.
- A ficha não grava dados e não deve adicionar bindings de edição ou ações de
  save sem solicitação explícita.

## Contrato de entrada

A ficha recebe a chave do registro pela query string. O nome deve ser o nome
físico da PK. Como os parâmetros podem chegar normalizados, o pattern deve
tolerar explicitamente as formas minúscula e original:

```javascript
function getRecordId(data) {
  var id = data.get('id_example');

  if (id === null || typeof id === 'undefined' || id === '') {
    id = data.get('ID_EXAMPLE');
  }

  return id;
}
```

Não inferir outra chave nem usar o primeiro parâmetro disponível. Quando o ID
estiver ausente, retornar os dados sem consultar a entidade. O comportamento para
registro inexistente deve ser deliberado; por padrão, retornar a ficha vazia sem
lançar uma exceção técnica.

## Pattern Nashorn

O pattern estende `DynaFormBusinessDelegate`, consulta a entity principal e
publica um objeto semântico no `TO data`:

```javascript
(function () {
  var DynaFormBusinessDelegate = Java.extend(
    Java.type('br.com.inpaas.forms.businessdelegate.DynaFormBusinessDelegate')
  );
  var l10n = require('inpaas.core.l10n');
  var daoFactory = require('inpaas.core.entity.dao');

  function beforeRender(renderContext, data) {
    var id = data.get('id_example');
    if (!id) {
      id = data.get('ID_EXAMPLE');
    }
    if (!id) {
      return data;
    }

    var record = daoFactory.getDao('EXAMPLE_ENTITY')
      .filter('id_example')
      .equalsTo(id)
      .findFirst();

    if (!record) {
      return data;
    }

    if (record.dt_record) {
      record.dt_record = l10n
        .getFormatter('fieldformat.fulldatetime')
        .format(record.dt_record);
    }

    data.put('record', record);
    return data;
  }

  return new DynaFormBusinessDelegate(scriptContext, form) {
    beforeRender: beforeRender
  };
})();
```

Regras:

- usar `.findFirst()` para a consulta unitária;
- filtrar pela PK física/alias efetivamente exposto pelo DAO;
- formatar datas no backend com o formatter localizado adequado;
- manter o HTML apenas como apresentação, sem queries ou regras de negócio;
- publicar o resultado em uma chave semântica, como `record`, `attendance` ou
  `customer`;
- não usar `node --check` como validação definitiva: a sintaxe de extensão de
  classe Java do Nashorn não é JavaScript válido para o parser do Node.js;
- confirmar a execução no runtime da plataforma.

## Conteúdo textual legado

Textos podem conter `<br>`, `<br/>` ou `<br />`. Normalizar essas marcas no
pattern e renderizar com Mustache escapado:

```javascript
function normalizeText(value) {
  return value ? String(value).replace(/<br\s*\/?\s*>/gi, '\n') : value;
}
```

```html
<pre class="detail-text">{{data.record.tx_description}}</pre>
```

Não usar `{{& valor }}` ou triple Mustache apenas para preservar quebras de linha.
O elemento deve usar `white-space: pre-wrap`.

## Estrutura visual

Quando a solicitação pedir aderência à ficha tradicional de atendimento, usar
os valores abaixo. Eles constituem o contrato visual observado, não uma nova
identidade global da plataforma.

### Dimensões e tipografia

- largura da ficha: `750px`, centralizada;
- fonte de labels, valores e textos: `Arial, Helvetica, sans-serif`;
- tamanho de labels, valores e textos: `11px`;
- título principal: `22px`;
- título de seção: `15px`, branco e em negrito;
- declarar a fonte e o tamanho também em `table`, `th`, `td` e `pre`, pois CSS
  do ambiente pode aplicar tamanhos próprios a esses elementos;
- usar `font-size: 11px !important` no `pre` quando necessário para neutralizar
  a folha global do produto.

### Cores

- borda externa do cabeçalho: `rgb(126,164,194)`;
- fundo claro do cabeçalho: `rgb(244,244,244)`;
- título principal e sua linha: `rgb(64,101,123)`;
- cabeçalho das seções e bordas dos blocos: `rgb(103,150,178)`;
- conteúdo: fundo branco.

### Grade dos dados

Cada linha comum possui quatro células na proporção da ficha original:

```text
label 15% | valor 35% | label 15% | valor 35%
```

Aplicar `width` diretamente nas células de dados, como no template de origem:

```html
<tr>
  <th style="width:15%;">Rótulo A</th>
  <td style="width:35%;">Valor A</td>
  <th style="width:15%;">Rótulo B</th>
  <td style="width:35%;">Valor B</td>
</tr>
```

As larguras não devem ser aplicadas ao cabeçalho principal da ficha. O CSS
genérico da tabela também não substitui a definição inline quando a exigência é
reproduzir exatamente a ficha tradicional.

Para um valor que ocupa a linha inteira:

```text
label 15% | valor com colspan="3" e width 85%
```

Não desenhar separadores horizontais entre as linhas. Manter somente a borda
externa do bloco e o fundo azul do título de seção.

### Cabeçalho de seção e imagem

O título da seção fica em uma faixa azul. Quando a ficha de referência possuir
um ícone, reutilizar o mesmo asset aprovado, sem gerar uma variação visual:

```html
<tr>
  <td class="detail-section-icon"><img src="..." alt="" /></td>
  <td class="detail-section-title" colspan="3">Título da seção</td>
</tr>
```

Dimensões observadas para o ícone:

- célula: `65px` de largura, `padding-top: 1px` e `padding-left: 3px`;
- imagem: `65px` por `27px`;
- célula e título com fundo `rgb(103,150,178)`.

Se o asset estiver embutido como data URI no form de referência, copiar a data
URI integralmente. Não editar nem recomprimir a imagem sem solicitação.

## Labels e localização

- Textos estáticos usam
  `{{#localization}}chave.da.label{{/localization}}`.
- Labels de colunas seguem `label.{entidade}.{coluna}`, em minúsculas.
- A PK usa `label.id` quando for exibida como identificador interno.
- Títulos próprios da ficha e das seções devem possuir chaves semânticas no
  mesmo namespace da entidade.
- Consultar os idiomas do ambiente antes de criar traduções.
- Associar as labels ao módulo informado pelo usuário; não inferir outro módulo.
- Preservar labels globais existentes antes de associá-las a um novo módulo.

## Mustache

Usar caminhos coerentes com a chave publicada no pattern:

```html
{{data.record.ds_integrationcode}}
{{data.record.dt_record}}
```

Regras:

- usar Mustache comum para valores de texto;
- não colocar formatação de data, domínios ou regras condicionais complexas no
  HTML;
- usar `{{& designer-html }}` somente quando a ficha também precisar renderizar
  uma árvore de fields; fichas puramente HTML com `<fields/>` vazio não precisam
  desse placeholder;
- deixar `alt=""` em ícones decorativos para não criar ruído em leitores de
  tela.

## Publicação e verificação

1. Validar que o XML continua bem-formado e que `<fields/>` vazio foi preservado
   quando a ficha não usa Form Design.
2. Publicar o pattern existente pela API de sources.
3. Publicar juntos HTML, CSS, JavaScript e XML existentes do form.
4. Consultar novamente os dois recursos e confirmar os trechos essenciais.
5. Confirmar que as labels foram criadas e associadas ao módulo correto.
6. Abrir a ficha com um ID real no ambiente da plataforma e conferir:
   - consulta e formatação das datas;
   - fonte de `11px` em todas as células e textos longos;
   - títulos de `22px` e `15px`;
   - grade `15/35/15/35` somente nos dados;
   - ausência de divisões horizontais;
   - ícone e fundo azul do cabeçalho de seção;
   - comportamento para campos opcionais vazios.

A rota local do dev kit entrega o HTML estático e não executa o pattern Nashorn.
O teste final precisa usar o runtime real da plataforma. Se a versão publicada
não aparecer imediatamente, considerar o cache de forms descrito em
`form-design.md` antes de republicar ou alterar o recurso novamente.
