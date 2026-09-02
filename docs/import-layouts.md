# Layouts de importação

Este tópico reúne o conhecimento necessário para criar layouts que serão
consumidos pelo importador já existente da plataforma. A criação do layout e a
execução da importação são frentes diferentes: automatizar layouts não implica
substituir, disparar ou alterar o importador.

O conteúdo abaixo descreve o comportamento observado nos sources e entidades
analisados. Antes de automatizar a persistência de um layout, estudar também um
layout real criado corretamente no ambiente e confirmar o mecanismo autorizado
de gravação.

## Sources estudados

- `plusoftcrm.utils.importlogtaskbusiness`: tarefa que processa a fila;
- `plusoftcrm.utils.businessdelegate.dataimportutils`: leitura do arquivo,
  persistência do layout e execução da importação;
- `plusoftcrm.crm.pattern.businessdelegate.utils`: conversão entre aliases e
  colunas físicas e insert/update genérico usado por `saveLayout`.

## Visão geral do fluxo existente

1. `postImport(data)` valida o arquivo, chama `saveLayout(data.layout)`, cria
   `DATAIMP_IMPORT`, cria `DATAIMP_IMPORTLOG` e adiciona o log à fila
   `DATAIMP_SCHEDIMPORTLOG`.
2. `plusoftcrm.utils.importlogtaskbusiness.execution()` busca itens pendentes
   (`DO_STATUS = 'P'`) pela query `crm.scheduler.importlog.pending`.
3. A tarefa tenta marcar o item como `R`, chama `importData(ID_IMPORTLOG)` e
   depois tenta marcá-lo como `S`.
4. `importData` carrega importação, layout e campos, lê o arquivo e grava cada
   linha na entidade principal definida pelo layout.

O trabalho de criação de layouts deve produzir registros coerentes em
`DATAIMP_LAYOUT` e `DATAIMP_LAYOUTFIELD`. Não criar registros de importação,
logs ou fila apenas para cadastrar um layout.

## Entidade `DATAIMP_LAYOUT`

| Alias de entrada | Coluna física | Uso observado |
|---|---|---|
| `layoutid` | `ID_LAYOUT` | Identificador; insert quando ausente, update quando maior que zero |
| `layoutname` | `DS_LAYOUT` | Nome do layout |
| `strategykey` | `DS_STRATEGYKEY` | Source opcional da estratégia |
| `inactiverecord` | `DO_INACTIVE` | Indicador de inatividade |
| `type` | `DO_TYPE` | `F` ou `D`; o executor estudado não ramifica por esse valor |
| `delimiter` | `DO_DELIMITER` | Delimitador efetivamente usado na leitura |
| `hasheader` | `DO_HASHEADER` | `Y` ignora a primeira linha |
| `fieldqualification` | `DO_FIELDQUALIFICATION` | `D` para aspas duplas, `S` para aspas simples |
| `defaultdateformat` | `DS_DEFAULTDATEFORMAT` | Máscara Java padrão para datas |
| `defaulttimeformat` | `DS_DEFAULTTIMEFORMAT` | Existe no modelo, sem uso no executor estudado |
| `decimalseparator` | `DO_DEFAULTDECIMALSEPARATOR` | Substituído por ponto em campos numéricos |
| `updateexistingrecord` | `DO_UPDATEEXISTINGRECORD` | Existe no modelo, sem consulta no executor estudado |
| `key` | `DS_KEY` | Chave textual do layout; sem uso no executor estudado |
| `currency` | `DO_CURRENCY` | Existe no modelo, sem uso no executor estudado |
| `decimaldigits` | `NR_DECIMALDIGITS` | Existe no modelo, sem uso no executor estudado |
| `mainobjetobd` | `DS_MAINOBJETOBD` | Nome físico da entidade principal de destino |

`DO_DELIMITER` possui tamanho 1. No payload de `saveLayout`, o valor `O`
significa “outro”; antes de persistir, ele é substituído por
`anotherdelimiter`.

## Entidade `DATAIMP_LAYOUTFIELD`

Há um registro para cada coluna posicional do arquivo, inclusive colunas que
serão ignoradas.

| Alias de entrada | Coluna física | Uso observado |
|---|---|---|
| `layoutfieldid` | `ID_LAYOUTFIELD` | Identificador do campo do layout |
| `layoutid` | `ID_LAYOUT` | Vínculo com o layout |
| `objetobdname` | `DS_OBJETOBDNAME` | Entidade associada ao campo |
| `campobdname` | `DS_CAMPOBD` | Coluna física de destino |
| `analysis` | `DO_ANALYSIS` | `Y` inclui o campo na procura do registro existente |
| `format` | `DS_FORMAT` | Máscara específica de data; prevalece sobre a do layout |
| `delimitedposition` | `NR_DELIMITEDPOSITION` | Existe no modelo, sem uso na execução estudada |
| `fixedstart` | `NR_FIXEDSTART` | Existe no modelo, sem uso na execução estudada |
| `fixedend` | `NR_FIXEDEND` | Existe no modelo, sem uso na execução estudada |
| `action` | `DO_ACTION` | `I`, `U` ou `G`; `G` ignora a coluna |
| `description` | `TX_DESCRIPTION` | Descrição exibida no layout |
| `strategykey` | `DS_STRATEGYKEY` | Existe no campo, mas não é invocado na execução estudada |
| `sequence` | `NR_SEQUENCE` | Ordem posicional das colunas |
| `onlynumbers` | `DO_ONLYNUMBERS` | `Y` remove tudo que não for dígito |

Os campos são carregados em ordem crescente de `NR_SEQUENCE` e acessados pelo
mesmo índice da coluna lida. Portanto, não omitir do layout uma coluna presente
no CSV: criar um `DATAIMP_LAYOUTFIELD` com ação `G` para manter o alinhamento.
Quando `sequence` não é informado em `saveLayout`, recebe o índice iniciado em
zero.

## Transformação feita por `saveLayout`

`saveLayout(data)` espera `rowlayoutfields`; usa apenas o primeiro item e sua
propriedade `layoutfields`. O layout e seus campos são persistidos por
`defaultPostDataEncoded`, que decodifica os aliases conforme o modelo da
entidade, insere ou atualiza pela chave primária e devolve novamente os aliases.

Para cada campo:

- define `layoutid` com o ID do layout salvo;
- converte `objetobdname` recebido como objeto para seu `ds_objetobd`;
- `existingrecord === true` força `action = 'U'`;
- caso contrário, `action === true` vira `I` e qualquer outro valor vira `G`;
- booleano `onlynumbers` vira `Y` ou `N`;
- normaliza `format` removendo o prefixo `string:`.

Essas regras descrevem o payload da tela atual. Uma futura automação pode usar
o mesmo serviço, mas não deve inventar o formato sem antes confirmar um payload
real completo.

## Como cada linha é interpretada

- O executor usa sempre `DO_DELIMITER` para separar a linha.
- Se não houver qualificador, usa `String.split(delimiter)` da engine JavaScript.
- Com qualificador, usa um parser próprio, limitado a 200 colunas.
- `D` remove um par de aspas duplas e `S` remove um par de aspas simples.
- O fluxo relê os bytes da linha como `ISO-8859-1` e os converte para `UTF-8`.
- Com cabeçalho, a linha de índice zero não é processada.
- Valores vazios não entram no objeto gravado; em updates, não limpam o campo.
- Datas usam a máscara do campo ou, na ausência dela, a máscara padrão do
  layout. A máscara é convertida para minúsculas e todo `m` vira `M` para o
  `SimpleDateFormat` Java.
- Essa normalização impede representar corretamente, na mesma máscara, mês
  (`M`) e minuto (`m`): após a transformação, ambos se tornam `M`. Não preencher
  automaticamente a máscara para timestamps ISO como
  `yyyy-MM-dd HH:mm:ss.SSS`; primeiro testar se o DAO do ambiente aceita o valor
  ISO sem conversão ou corrigir o importador com autorização explícita.
- Em campos `Numeric`, o separador decimal configurado é substituído por `.`.
- `DO_ONLYNUMBERS = 'Y'` remove caracteres não numéricos antes da gravação e
  também antes da análise.
- Valores textuais maiores que `CAMPOBD.NR_TAMANHO` geram erro de truncamento
  antes da persistência.

## Identificação e gravação do registro

Campos com `DO_ANALYSIS = 'Y'` formam um filtro conjunto na entidade principal.
O executor consulta apenas a primeira PK encontrada. Se encontrar registro,
executa update; caso contrário, insert.

No código estudado, `haveRecord` só é definido depois que todas as colunas já
foram transformadas. Por isso, durante a montagem do objeto, tanto `I` quanto
`U` são incluídos quando o registro ainda é tratado como novo. Na prática
observada nesse fluxo, `G` é a distinção segura entre mapear e ignorar; não
pressupor que `I` e `U` limitem campos exclusivamente a insert ou update sem um
teste controlado.

Sem nenhum campo de análise, o executor sempre insere. Campos de análise devem
ser escolhidos somente quando formarem uma chave de negócio confiável.

## Estratégia opcional

Se `DATAIMP_LAYOUT.DS_STRATEGYKEY` estiver preenchido e o source puder ser
carregado, o importador reconhece:

- `onstart(importacao)` antes das linhas;
- `onrecord(registro, importacao, numeroDaLinha)` antes de insert/update;
- `onerror(erroDoLog, importacao)` quando uma linha falha;
- `onfinish(logDaImportacao)` após o arquivo.

Falhas nos hooks `onstart`, `onerror` e `onfinish` são registradas em log e não
são relançadas pelo chamador. `onrecord` executa dentro do `try` da linha e sua
falha torna a linha inválida.

Como `onrecord` roda depois da montagem do objeto e antes do insert/update, ele
pode substituir strings por tipos aceitos pelo DAO. Isso permite corrigir datas
sem alterar o importador: manter a máscara do layout vazia, interpretar a string
na estratégia com `java.text.SimpleDateFormat` e atribuir ao campo o
`java.util.Date` retornado por `parse()`. O `DateTimeConverter` da plataforma
aceita `java.util.Date` diretamente.

Para timestamps com milissegundos no formato
`2020-08-27 12:27:32.167`, usar exatamente
`yyyy-MM-dd HH:mm:ss.SSS` e `setLenient(false)`. Tratar valores nulos/vazios e
não tentar converter novamente um valor que já seja `java.util.Date`. Criar o
parser dentro de `onrecord` ou da própria chamada; `SimpleDateFormat` não deve
ser compartilhado entre threads.

Uma estratégia usada pelo importador deve exportar os quatro hooks esperados,
mesmo quando alguns não precisarem executar ações:

```javascript
return {
  onerror: onerror,
  onstart: onstart,
  onfinish: onfinish,
  onrecord: onrecord
};
```

Antes de publicar um layout, avaliar se o mapeamento posicional e as conversões
nativas do importador são suficientes. Solicitar uma estratégia quando houver,
por exemplo:

- de-para de códigos ou domínios;
- resolução de chaves estrangeiras;
- busca de nomes ou IDs em outras entidades;
- criação de campos derivados que não existem como coluna no arquivo;
- normalização condicional de valores;
- conversão de datas que o parser nativo não suporte;
- validação ou preparação do registro antes do insert/update;
- ações necessárias no início, erro ou fim da carga.

Quando a estratégia for necessária, não criar o source implicitamente. Explicar
os tratamentos que ficarão nela e pedir ao usuário que crie previamente o
source no Studio e informe sua chave. Depois, baixar o source, implementar os
quatro hooks e vincular a chave em `DATAIMP_LAYOUT.DS_STRATEGYKEY`. Não executar
a importação até confirmar que o layout aponta para a estratégia publicada.

## Logs e limites observados

- Sucessos incrementam `NR_RECORDSSUCCESS` e geram
  `DATAIMP_IMPORTLOGRECORDKEY`.
- Falhas incrementam `NR_RECORDSFAIL` e geram `DATAIMP_IMPORTLOGERROR` com linha,
  número, erro e causa.
- Todas as linhas processadas incrementam `NR_RECORDSTOTAL`.
- Registro existente incrementa `NR_DUPLICATED`.
- Após mais de 30 erros consecutivos, novas linhas deixam de ser processadas
  pelo corpo principal; um sucesso anterior zera o contador.
- Existe pausa periódica configurável para reduzir impacto no servidor.

## Pontos que exigem confirmação antes de automatizar

- Payload real usado pela interface para criar um layout completo.
- Mecanismo/API que será autorizado para cadastrar apenas o layout e os campos.
- Convenção de `DS_KEY`, nome, módulo e inatividade dos layouts do projeto.
- Delimitador, cabeçalho, qualificador, codificação e máscaras esperados.
- Se houver campos entre aspas, verificar não apenas o delimitador geral, mas
  também delimitadores e quebras de linha dentro dos campos qualificados; o
  parser próprio do importador possui limitações.
- Entidade principal e correspondência exata entre cada posição do CSV e
  `DS_CAMPOBD`.
- Campos ignorados e campos usados para análise de duplicidade.
- Necessidade de estratégia e exemplos de estratégias equivalentes.
- Comportamento desejado de `I` e `U`, devido à implementação observada.

Quando qualquer item não puder ser inferido com segurança, pedir ao usuário um
layout existente equivalente ou um exemplo do cadastro na interface antes de
persistir registros.

## API de layouts para o VS Code

Os sources `inpaas.studio.vs-code` e `inpaas.studio.vscode.utils` expõem uma
API específica para consultar e publicar somente o layout e seus campos:

```http
GET  /api/vs-code/import-layouts/{name}
POST /api/vs-code/import-layouts/publish
```

Exemplo de publicação:

```json
{
  "name": "Carga Histórica - Usuários",
  "mainEntity": "CST_HIST_USERS",
  "delimiter": ";",
  "hasHeader": true,
  "fieldQualification": null,
  "defaultDateFormat": null,
  "decimalSeparator": null,
  "strategyKey": null,
  "inactive": false,
  "fields": [
    {
      "description": "Código corporativo",
      "targetColumn": "DS_INTEGRATIONCODE",
      "action": "I",
      "analysis": true,
      "onlyNumbers": false,
      "format": null
    }
  ]
}
```

A publicação:

- exige nome, entidade principal e ao menos um campo;
- valida a entidade em `OBJETOBD` e cada coluna em `CAMPOBD`, combinando nome
  da coluna com o ID da entidade;
- aceita somente as ações `I`, `U` e `G`;
- converte indicadores booleanos para `Y` ou `N`;
- define `DO_TYPE = 'D'` e a sequência pela posição do array;
- usa o nome do layout como identidade para publicação idempotente;
- recusa reutilizar o mesmo nome para outra entidade;
- insere um layout novo ou atualiza o existente;
- ao atualizar, substitui integralmente seus `DATAIMP_LAYOUTFIELD`;
- executa atualização do layout e dos campos na mesma transação;
- não cria `DATAIMP_IMPORT`, logs, fila e não executa o arquivo.

O `GET` retorna as colunas físicas de `DATAIMP_LAYOUT` e um array `fields` com
os registros de `DATAIMP_LAYOUTFIELD` ordenados por `NR_SEQUENCE`. No wrapper
Knex da plataforma, construir a query não a executa: a leitura da coleção deve
terminar com `.find()`.

Antes de publicar, inspecionar o CSV inteiro e confirmar cabeçalhos, quantidade
de colunas por linha, comprimentos máximos e duplicidade dos campos de análise.
Depois de publicar, consultar o layout pela nova API e confirmar ID, entidade,
configuração e quantidade/ordem dos campos. Republicar o mesmo payload deve
preservar o ID e não duplicar campos.

## Alertas no agendador estudado

O source `plusoftcrm.utils.importlogtaskbusiness` atualiza a fila usando a chave
`id_mkt_schedcampaignsegmentations`, embora a PK modelada de
`DATAIMP_SCHEDIMPORTLOG` seja `id_dataimp_schedimportlog`. Também não há um
`catch` externo que marque a fila como `E` se `importData` lançar uma exceção
fora do tratamento por linha. Esses pontos pertencem à execução da importação,
não à criação de layouts; não corrigi-los implicitamente durante a automação de
layouts.
