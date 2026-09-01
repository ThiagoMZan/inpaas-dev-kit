# Binding e persistência de forms tradicionais

Este documento descreve como fields de um Form Design tradicional são ligados
às entities da plataforma e como o save padrão persiste mestre e detalhes. Não
se aplica a Forms V2/Vue.

## Princípio do binding

Um form pode estar associado a uma entity principal. Cada `FormField` pode
estar ligado a um atributo dessa entity ou de outra entity:

```xml
<field name="customer-name"
       type="TEXT"
       entity="CRM_CUSTOMER"
       entity-field="DS_NAME"
       visible="true">
  <properties>
    <property name="id">customer-name</property>
  </properties>
</field>
```

O XML usa nomes físicos. Durante a importação,
`FormFieldBusinessDelegate` resolve `entity` e `entity-field` no cache de
entities e persiste seus IDs internos. IDs de entity e atributo não devem ser
escritos manualmente no XML.

O atributo HTML `name` gerado para inputs vem de `FormField.name`, não
necessariamente do nome da coluna. No POST, o backend encontra novamente o
`FormField` pelo nome recebido e só então determina a entity e a coluna de
destino.

Fields sem `entity`/`entity-field`, ou tipos puramente visuais, podem participar
da interface sem entrar no save automático.

## Save no frontend

O runtime tradicional define `window.dynaform.save(form, opts)` em
`web-inpaas/src/main/webapp/web/js/inpaas-default.js`.

O fluxo:

1. lê `form-key` e o input marcado com `record-id`;
2. verifica `data-permission-insert` ou `data-permission-update`;
3. desabilita inputs de template de datatable para não validá-los;
4. executa validação jQuery quando disponível;
5. marca os inputs de template com `dynaform-template-field`;
6. descarrega editores HTML para sincronizar seus valores;
7. usa o atributo `action` do próprio `<form>` como URL;
8. envia `POST` com `serialize()` ou `FormData` quando há upload;
9. dispara o evento `aftersave` com a resposta.

O `action` é o `postpath` produzido pelo template, normalmente a mesma rota que
abriu o form:

```text
POST /forms/{form-key}
POST /forms/{form-key}/{record-id}
```

Sem record ID, o controller exige `INSERT`; com record ID, exige `UPDATE`.

## Entrada no backend

`FormController.doPost()` obtém o delegate pela
`DynaFormBusinessDelegateFactory` e chama:

```java
delegate.set(requestData, recordId)
```

Sem source Nashorn vinculado, é usado `DynaFormBusinessDelegate`. Com pattern
vinculado, a factory executa o source e materializa uma especialização desse
delegate.

O método `set()` primeiro chama `parseFormData()`. Para cada parâmetro postado:

1. localiza o field com `form.getFormFieldPost(name)`;
2. ignora parâmetros sem field ou sem binding completo;
3. converte o valor conforme tipo do componente e field format;
4. separa dados da entity principal e de entities filhas.

Valores vazios viram `null`. Upload, comentário e fields formatados possuem
conversores específicos.

## Dados mestre

Se o `entityId` do field é igual ao da entity principal do form, o valor entra
diretamente no `TO` mestre usando `entity-field` como chave:

```text
campo HTML customer-name
    -> FormField customer-name
    -> entity CRM_CUSTOMER
    -> entity-field DS_NAME
    -> maindata.DS_NAME
```

Depois de `beforeSet`, a PK da entity principal recebe o record ID, quando
existente, e `save(parentEntity, maindata)` decide entre insert e update. Em um
insert, a PK gerada é lida do próprio `maindata`.

O retorno recebe `record-id` e passa por `afterSet` antes de voltar ao
frontend.

## Dados mestre-detalhe

Quando um field aponta para outra entity, `parseFormData()` agrupa os valores
em:

```text
children: Map<entityId, List<TO>>
```

Inputs repetidos, como linhas de datatable, são alinhados pelo índice de suas
listas. Cada item representa um registro detalhe. O mapa usa o ID interno da
entity, embora o XML continue usando seu nome físico.

Após salvar o mestre, para cada entity filha o delegate:

1. confirma que existe referência entre detalhe e mestre;
2. carrega os detalhes atualmente persistidos;
3. remove a primeira linha quando ela representa apenas o template da tabela;
4. identifica updates pela PK do detalhe;
5. adiciona a PK do mestre ao item filho;
6. executa `save(childEntity, childdata)` para cada item recebido;
7. remove registros antigos que não permaneceram na coleção enviada.

Se a única linha contém apenas `dynaform-template-field`, os detalhes atuais
são removidos. Se a entity filha nem aparece em `children`, ela não entra nesse
ciclo.

O relacionamento é obtido do modelo de entities, por `EntityReference`. O
fluxo reconhece referência do detalhe para o mestre e possui tratamento para
referência inversa. A modelagem da FK precisa estar correta na plataforma;
proximidade de nomes de tabelas não é suficiente.

Fields de uma entity secundária não viram detalhe automaticamente apenas por
estarem dentro de um container visual. O que determina o agrupamento é o
binding `entity`/`entity-field` e a referência declarada entre as entities.

## Hooks do DynaFormBusinessDelegate

Os hooks mais usados são:

- `beforeSet(data, id)`: recebe os dados já separados em mestre e `children`, antes da persistência;
- `afterSet(data)`: recebe o mestre salvo com `record-id`;
- `beforeRender(context, data)`: executa antes de renderizar fields em modos diferentes de `DESIGN`;
- `afterRender(context, formData, designerHtml)`: pode alterar o HTML gerado;
- `beforeList(formField, fixedFilter, criteria)`: ajusta uma listagem antes da query;
- `afterList(formField, data)`: transforma a coleção retornada.

`beforeSet` é o ponto para completar, transformar ou reorganizar `children`
quando o binding automático não expressa a regra necessária. Ele não deve ser
usado para repetir manualmente um mapeamento que fields e referências já
resolvem.

Na versão `2.7.67-dev`, `beforeSet` deve mutar o `TO` recebido. O método Java
atribui o retorno do hook a uma variável, mas continua persistindo o objeto
`maindata` original. Retornar um novo objeto sem modificar o argumento não
substitui efetivamente os dados usados pelo save nessa versão.

Em Nashorn, é comum o source retornar uma extensão de
`DynaFormBusinessDelegate`, recebendo `scriptContext` e o binding global
`form`. Ao modificar esses hooks, preservar o contrato `TO`/coleções Java e os
IDs internos usados como chaves de `children`.

## Metadados necessários para criar um field

Para atender com segurança a um pedido como “crie um campo do tipo X que grava
em TABELA.COLUNA”, é preciso conhecer:

- chave do form e sua entity principal;
- nome físico da entity alvo;
- nome físico do atributo;
- tipo, tamanho e escala;
- obrigatoriedade e valor default;
- PK da entity;
- domínio do atributo, quando houver;
- field format aplicável;
- referência FK, query FK e entity referenciada;
- se o valor pertence ao mestre ou a um detalhe;
- cardinalidade esperada para detalhe;
- componente visual e propriedades desejadas;
- posição na árvore/layout do XML.

Para um field simples da entity principal, entity, atributo e tipo geralmente
bastam para uma primeira proposta. `required`, domínio, referência e formato
podem mudar o componente correto: por exemplo, texto, checkbox, combobox,
combobox FK, data ou numeral.

Para mestre-detalhe, é obrigatório confirmar PKs e referências entre as duas
entities. Também é necessário examinar o componente que produzirá arrays no
POST, normalmente uma datatable ou lógica frontend específica.

## Fontes de metadados

Há três fontes com finalidades diferentes:

- autocomplete SQL do plugin: lista tabelas e colunas, mas atualmente descarta metadados ricos;
- XML de entity baixado pela extensão: contém atributos, tipos, PK, domínios e referências e é a melhor evidência local;
- cache de entities da plataforma: `InstanceContext.getInstance().getCache()` expõe o `DatabaseEntity` efetivamente usado pelo runtime.

O comando `inPaaS: Baixar entity` deve ser usado para materializar localmente a
entity alvo antes de editar bindings complexos. Para mestre-detalhe, baixar
tanto a entity mestre quanto a detalhe.

Se esse fluxo ficar frequente, `inpaas.studio.vscode.utils` pode expor um método
de leitura de metadados por nome, retornando apenas dados necessários ao design:

```json
{
  "name": "CRM_CUSTOMER",
  "primaryKey": "ID_CUSTOMER",
  "fields": [
    {
      "name": "DS_NAME",
      "type": "VARCHAR",
      "size": 200,
      "required": true,
      "defaultValue": null,
      "domains": []
    }
  ],
  "references": []
}
```

Esse método seria uma conveniência para o plugin e não substituiria o cadastro
de entities. Antes de criá-lo, validar se o XML de entity já cobre o fluxo real
de trabalho sem custo excessivo.

## Checklist para alteração assistida

Antes de adicionar ou mudar um field com persistência:

1. carregar o XML do form e identificar sua entity principal;
2. carregar a definição da entity alvo;
3. confirmar que o atributo existe e é gravável;
4. escolher `FormFieldType` compatível com tipo, domínio e referência;
5. definir `name` único e binding físico correto;
6. verificar propriedades frontend necessárias;
7. se for detalhe, confirmar FK, PK, cardinalidade e formato do POST;
8. examinar o source Nashorn do form para hooks que alterem os dados;
9. preservar fields, filtros e fragmentos não relacionados;
10. testar insert, update e, para detalhes, remoção de linhas.
