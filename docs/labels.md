# Labels e traduções

Este documento descreve o contrato existente da plataforma para consultar e
gravar labels. Reutilizar as rotas do Studio antes de criar um endpoint novo ou
manipular diretamente as tabelas.

## Sources de referência

- REST de Studio: `inpaas.devstudio.rest.studio`, publicado sob `/api/studio`;
- serviço: `inpaas.devstudio.service.studio`;
- persistência: `inpaas.devstudio.dao.label`.

Para integração com o VS Code, os sources existentes
`inpaas.studio.vs-code` e `inpaas.studio.vscode.utils` podem consumir essas
rotas. Eles não implementam atualmente operações próprias de labels.

## Modelo de dados

`CORE_LABEL` armazena a definição global da label:

- `ID_LABEL`: chave primária;
- `DS_KEY`: chave textual única, com até 255 caracteres;
- `DS_DESCRIPTION`: texto-base, com até 1000 caracteres;
- `TX_TRANSLATIONS`: objeto JSON de traduções, indexado pelo locale.

`CORE_MODULELABEL` associa uma label a um módulo:

- `ID_MODULELABEL`: chave primária;
- `ID_LABEL`: referência a `CORE_LABEL`;
- `ID_MODULE`: referência a `CORE_MODULE`.

O par `ID_LABEL` e `ID_MODULE` é único. Uma mesma label global pode pertencer a
mais de um módulo.

## Convenção para campos de entidade

A chave de um campo comum segue:

```text
label.{entidade}.{coluna}
```

Entidade, coluna e chave completa são convertidas para minúsculas. Exemplo:

```text
label.cst_hist_users.ds_integrationcode
```

As exceções usadas no design de forms continuam válidas:

- chave primária: `label.id`;
- `DO_INACTIVE`: `label.inactive`;
- chave estrangeira: `label.{entidade_referenciada}`.

Labels de campos devem ser associadas ao módulo indicado pelo usuário. Não
inferir o módulo quando ele não estiver inequívoco; solicitar o módulo ou um
exemplo existente.

### Entity JSON e o editor local

O modelo JSON local da entity descreve sua estrutura, mas não deve ser tratado
como fonte completa dos textos traduzidos da entity e de seus campos. Esses
textos pertencem ao cadastro global de labels.

No editor local, usar a estrutura JSON da entity para identificar o campo e
derivar a chave pela convenção acima. Para exibir textos já existentes,
consultar `CORE_LABEL` globalmente por `DS_KEY` e usar o texto-base ou a
tradução do locale atual. Para uma label nova ou alterada, manter a alteração
pendente no artefato local e publicá-la somente pelo comando manual de
publicação da entity; salvar o JSON não deve criar ou atualizar labels.

## Contexto de módulo no VS Code

`CORE_LABEL.DS_KEY` é global e único. A seleção de módulo não participa da
leitura de labels no editor local. Ela é necessária somente na publicação
manual, para criar ou preservar a associação de deploy em `CORE_MODULELABEL`.
Quando a API do Studio exigir `moduleId` na rota de consulta, a busca por
`search` continua global e não deve ser interpretada como filtro de módulo.

## Idiomas

Consultar os idiomas do ambiente antes de montar traduções:

```http
GET /api/studio/languages
```

No ambiente analisado, a resposta contém os locales `pt`, `en`, `es` e `fr`.
Não assumir que essa lista é idêntica em todos os ambientes.

## Criar ou atualizar uma label

```http
POST /api/studio/modules/{moduleId}/labels
Content-Type: application/json
```

Payload:

```json
{
  "moduleId": 123,
  "key": "label.cst_hist_users.ds_integrationcode",
  "text": "Código corporativo",
  "translations": {
    "pt": "Código corporativo",
    "en": "Corporate code",
    "es": "Código corporativo"
  }
}
```

O DAO exige `key`, `text` e `moduleId`. Embora o módulo também esteja no path,
o contrato atual de `setLabels` valida `moduleId` no objeto recebido; por isso,
enviá-lo explicitamente no payload.

Comportamento da gravação:

1. converte `key` para minúsculas;
2. remove traduções nulas ou vazias;
3. procura `CORE_LABEL` pela chave única;
4. insere a label ou atualiza integralmente sua descrição e traduções;
5. cria a associação em `CORE_MODULELABEL` se ela ainda não existir;
6. solicita a recarga das labels do ambiente.

Esse fluxo foi validado de ponta a ponta pela API: a resposta da consulta
posterior trouxe o `ID_LABEL`, o texto-base e as traduções gravadas, e a
listagem sem busca do módulo confirmou a associação em `CORE_MODULELABEL`.

`CORE_LABEL` é global. Atualizar uma chave já associada a outros módulos altera
o texto e as traduções vistos por todos eles. Antes de atualizar uma label
existente, confirmar que a chave representa o mesmo conceito.

## Gravação em lote por idioma

```http
POST /api/studio/modules/{moduleId}/labels/{lang}
Content-Type: application/json
```

O corpo é um objeto cujas propriedades são chaves de labels:

```json
{
  "label.cst_hist_users.ds_integrationcode": "Código corporativo",
  "label.cst_hist_users.ds_name": "Nome",
  "label.cst_hist_users.ds_nickname": "Nickname"
}
```

Essa rota preserva traduções de outros locales e altera somente o locale
informado. Quando cria uma label inexistente, usa a própria chave como
`DS_DESCRIPTION` e grava o texto em `TX_TRANSLATIONS[lang]`. Portanto, preferir
a rota unitária quando também for necessário definir um texto-base legível.

## Consulta e remoção

```http
GET    /api/studio/modules/{moduleId}/labels
GET    /api/studio/modules/{moduleId}/labels/{key}
DELETE /api/studio/modules/{moduleId}/labels/{key}
```

A listagem aceita `search`, `start`, `length` e `draw`. Sem busca, restringe as
labels ao módulo. Com `search`, o DAO pesquisa a chave globalmente, mesmo que a
label ainda não esteja associada ao módulo.

Não usar apenas a primeira página para validar a associação. A listagem é
ordenada por `DS_KEY`, pode conter centenas de registros e respeita `start` e
`length`; percorrer as páginas até encontrar a chave ou alcançar
`recordsTotal`. A resposta inclui `recordsTotal`, `recordsFiltered`, `data` e
`languages`. Cada item de `data` é um array iniciado por chave e texto-base,
seguido pelos textos na ordem apresentada em `languages`.

A consulta de uma chave não usa efetivamente o módulo e retorna, para uma chave
inexistente, um objeto com `id: null`, `key`, `text` igual à própria chave e
`translations: {}`.

Na remoção, o DAO exclui primeiro apenas a associação com o módulo. A linha de
`CORE_LABEL` é excluída somente quando não restar nenhuma associação em
`CORE_MODULELABEL`.

## Cuidados de automação

- No VS Code, exigir módulo ativo selecionado e usar seu `id` como `moduleId`;
  fora desse fluxo, consultar ou receber explicitamente o módulo antes da
  gravação.
- Consultar os idiomas disponíveis em vez de fixar locales globalmente.
- Gerar chaves em minúsculas e respeitar a convenção específica de campos.
- Não substituir traduções existentes sem antes lê-las ou usar a rota em lote
  para alterar somente um idioma.
- Tratar a chave como identidade global, não como identidade por módulo.
- Antes de criar, consultar cada chave individualmente. Um retorno com
  `id: null` indica que a chave ainda não existe.
- Depois de criar, consultar novamente cada chave e confirmar a associação na
  listagem paginada do módulo.
- Quando chave, módulo, texto-base, tradução ou padrão de nomenclatura forem
  ambíguos, pedir ao usuário exemplos antes de gravar.
