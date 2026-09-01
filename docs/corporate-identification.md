# Fluxo de identificação corporativa

Este documento descreve o template de identificação corporativa construído
sobre o form de identificação de pessoas e o mecanismo de form strategy. O
fluxo permite consultar uma origem corporativa/legada, apresentar seus
resultados junto com pessoas locais e materializar a pessoa escolhida em
`CRM_PERSON` antes de continuar o processo normal.

É um padrão reutilizável, não uma integração fechada. Cada cliente pode alterar
API, autenticação, payload, regras de conversão, deduplicação e campos
obrigatórios. Quando o usuário mencionar **identificação corporativa**, partir
deste contrato e depois localizar a implementação específica do ambiente.

No fluxo padrão, a implementação específica deve evoluir o source existente
`omni.prj.corporateidentification.main.utils`. Não criar outro backend nem mover
a busca/upsert para o JavaScript do strategy. Esse source já preserva a busca
Omni e contém os pontos iniciados para a integração corporativa.

## Recursos do template

- form principal:
  `plusoftcrm.person.forms.crm_person.identification`;
- component form:
  `plusoftcrm.person.forms.crm_person.identification.component.corporateidentification`;
- strategy form:
  `plusoftcrm.person.forms.crm_person.identification.strategy.corporateidentification`;
- EAI service/pattern name: `CorporateIdentificationUtils`;
- source backend padrão, já existente e parcialmente implementado:
  `omni.prj.corporateidentification.main.utils`;
- entity de destino: `CRM_PERSON`;
- documento principal de identificação: `CRM_PERSON.DS_DOCNUMBER2`, tratado
  neste fluxo como CPF.

O form e o JavaScript principais são recursos do produto e devem permanecer
inalterados. Toda adaptação deve ser feita no component, strategy form e
strategy/backend específicos, conforme as regras de `form-design.md`.

## Composição do form

`plusoftcrm.libs.pattern.strategy.addForm(form)` descobre os filhos
`.component%` e `.strategy%` pela chave do form principal.

O component corporativo modifica a árvore em memória:

1. acrescenta ao container correspondente uma linha com o checkbox
   `chk-corporative-search` (`id=chk-corporative-search`);
2. substitui o field lógico `btn-search-person` por um botão cujo DOM id é
   `btn-search-corporate`;
3. substitui a região de lista identificada pelo field
   `f14148-t8893377625043839` por um widget que contém
   `div-person-list`.

Os nomes compartilhados com o form base são pontos de acoplamento deliberados
da composição. Se uma atualização do produto renomeá-los ou mudar seus pais, a
strategy pode deixar de aplicar e deve ser reavaliada; o conserto continua no
component, nunca no form principal.

O strategy form não possui fields próprios no template. Seu JavaScript cria a
tabela `tbl-person-list` dentro de `div-person-list`, e seu CSS define cursor e
hover para as linhas selecionáveis.

## Contrato reutilizado do form principal

No `dynaform.onload`, o JavaScript principal expõe no escopo do form:

- `localScope.getSearchFilterFields()`: lê e normaliza os filtros da tela;
- `localScope.buildPhone(record)`: monta o telefone principal para exibição.

`getSearchFilterFields()` lê, entre outros, `txt-person-docnumber2`, remove
todos os caracteres não numéricos e publica o resultado como
`ds_docnumber2`. A strategy reutiliza essas funções públicas em vez de copiar a
leitura de todos os campos.

O botão corporativo não possui o `data-target` usado pelo handler de busca do
produto. Assim, seu clique é tratado pelo JavaScript da strategy. Quando o
checkbox não está marcado, a requisição passa pelo mesmo endpoint corporativo,
mas sem `do_corporative`; o backend deve então seguir a busca local normal.

## Busca

O fluxo frontend de busca é:

1. bloquear `btn-search-corporate`;
2. obter os filtros por `getSearchFilterFields()`;
3. adicionar `do_corporative=true` somente quando o checkbox estiver marcado;
4. emitir `omni.personlist.onsearch`, passando o objeto mutável de filtros;
5. enviar JSON por `POST` para
   `/api/eai-services/CorporateIdentificationUtils/find`;
6. desbloquear o botão no callback;
7. limpar e preencher `tbl-person-list` com a resposta.

Antes de inserir cada registro na tabela, a strategy calcula `ds_phone` com
`buildPhone()` e emite `omni.personlist.onrow`, permitindo que uma spec normalize
ou enriqueça a linha. Se a resposta possuir `message`, o template a trata como
lista vazia.

Pressionar Enter em qualquer input de texto do escopo dispara o clique do botão
corporativo.

### Busca local padrão

No source padrão `omni.prj.corporateidentification.main.utils`, o método
`CorporateIdentificationUtils.find(args)` já separa o ramo por
`do_corporative`. O ramo corporativo contém o ponto de implementação iniciado e
comentado. Enquanto ele não for preenchido, a execução continua para:

1. rejeita uma busca sem filtros com `label.crm_person.error.search`;
2. chama
   `CrmPersonUtilsBusinessDelegate.getPersonIdentificationList(args)`;
3. consulta `CRM_PERSON` com a query
   `crm.query.person.list.identificacao` e os filtros recebidos.

Para `ds_docnumber2`, a busca local usa igualdade. O business delegate também
aceita os demais filtros expostos pelo form, pagina, limita e ordena por
`ds_person` quando não há ordenação explícita.

### Busca corporativa esperada

Quando `do_corporative=true`, a implementação específica deve consultar a fonte
legada/corporativa e retornar objetos consumíveis pela tabela. Normalmente o CPF
em `ds_docnumber2` é a chave de consulta, mas isso deve ser confirmado no exemplo
do cliente. Registros já existentes localmente podem trazer `id_person`; dados
exclusivamente legados não devem fingir possuir esse ID.

O template reserva o evento `omni.personlist.onsearch` para adaptar filtros e
`omni.personlist.onrow` para adaptar resultados sem modificar seu JavaScript.

## Seleção e upsert

Ao clicar em uma linha:

- com `id_person`: a pessoa já existe na base local; a strategy grava esse ID
  em `hdn-id-person-notidentified` e dispara `change`, retomando o fluxo normal
  do chamador;
- sem `id_person`: o registro é considerado externo; a strategy envia o objeto
  completo por `POST` para
  `/api/eai-services/CorporateIdentificationUtils/upsert`.

O callback de upsert espera:

```json
{
  "id_person": 123
}
```

ou, em caso de erro de negócio:

```json
{
  "status": "error",
  "message": "..."
}
```

No sucesso, o `id_person` retornado é gravado no mesmo hidden e o evento
`change` continua o fluxo de identificação como se a pessoa tivesse sido
selecionada da base local.

O contrato funcional usual do backend é:

1. normalizar o CPF;
2. converter o payload legado para os nomes e tipos de `CRM_PERSON`;
3. localizar a pessoa por `DS_DOCNUMBER2`;
4. atualizar a existente ou inserir uma nova pessoa;
5. retornar seu `ID_PERSON`.

Esse upsert deve ser idempotente para o mesmo CPF e respeitar obrigatoriedade,
domínios, FKs, validações e efeitos de gravação da entity. A lista exata de
campos e as regras de precedência entre dado local e legado pertencem à
integração do cliente.

No source padrão atualmente analisado, `upsert(args)` contém o ponto de
implementação iniciado e comentado e ainda não persiste nada. É nesse método de
`omni.prj.corporateidentification.main.utils` que deve entrar a conversão real
para `CRM_PERSON` e o upsert. O exemplo de produção orienta o desenho, mas seu
source e suas regras de cliente não devem ser copiados literalmente.

## Pontos de extensão frontend

O template emite eventos jQuery no escopo do form:

- `omni.personlist.oninit`: recebe as opções mutáveis do DataTable antes da
  inicialização;
- `omni.personlist.onsearch`: recebe os filtros antes da chamada de busca;
- `omni.personlist.onrow`: recebe cada registro antes de adicioná-lo à tabela.

Customizações devem ouvir esses eventos com namespace próprio e manter
inicialização idempotente. Também podem usar component forms adicionais para
alterações estruturais. Não editar o form principal, seu XML ou seu JavaScript.

## Como analisar uma implementação

Ao receber uma demanda de identificação corporativa:

1. confirmar a chave do form principal e se seu pattern chama a form strategy;
2. ler os component e strategy forms com o prefixo da identificação;
3. resolver em `CORE_PATTERN` qual source atende o pattern name
   `CorporateIdentificationUtils`;
4. seguir os métodos `find` e `upsert` e suas dependências;
5. identificar endpoint externo, autenticação, timeout e tratamento de erro;
6. documentar o payload externo e o resultado apresentado na tabela;
7. mapear campo a campo a conversão para a entity `CRM_PERSON` baixada;
8. confirmar normalização e critério de deduplicação do CPF;
9. verificar transação, insert/update e retorno de `id_person`;
10. testar separadamente busca local, busca corporativa, seleção local, upsert
    de novo CPF, atualização de CPF existente e falhas da API.

Exceções de cliente devem ser registradas ao lado desse fluxo, sem transformar
uma regra particular em comportamento universal do template.

## Exemplo de produção: Oncoclínicas

O exemplo analisado usa um strategy JavaScript específico e o source
`oncoclinicas.main.identification.utils`, exposto pelo pattern name
`IdentificationUtils`. Ele demonstra uma implementação completa, mas suas
regras são particulares do cliente e não substituem o contrato genérico acima.
Ao gerar o fluxo padrão em outro ambiente, adaptar somente as regras necessárias
dentro de `omni.prj.corporateidentification.main.utils`, mantendo o pattern name
`CorporateIdentificationUtils`.

### Diferenças de interface e filtros

Além dos filtros do form principal, a implementação usa:

- `txt_protocolo_sf` -> `ds_protocolo_sf`;
- `txt_rne` -> `ds_rne`;
- `txt-person-docnumber2` -> CPF;
- `txt-person-docnumber3` -> passaporte.

Esses elementos adicionais pressupõem um component form específico do cliente;
o JavaScript sozinho não os cria. Ao marcar busca corporativa, ele desabilita
todos os inputs do escopo e reabilita somente o checkbox, CPF, passaporte e RNE.
Na inicialização, dispara um clique no checkbox, tornando corporativa a busca
inicial. O filtro `do_type` produzido pelo form principal é removido antes da
requisição.

O botão e os endpoints também são específicos:

```text
#btn-search-condorzon
/eai/services/IdentificationUtils/find
/eai/services/IdentificationUtils/upsert
```

O contexto de telefonia lê `hdn-origin=crm_telephony`, decodifica `dataspec` da
query string e preenche passaporte e RNE com `passportId` e
`foreignResidentId`. Esse comportamento é uma spec de canal, não parte
obrigatória da identificação corporativa.

O DataTable apresenta `id_person`, `ds_integration`, `ds_person`, `ds_email1` e
o telefone montado. A seleção preserva o contrato do template: linha com
`id_person` continua imediatamente; linha externa chama `upsert`.

Esta versão de produção não emite os eventos `omni.personlist.oninit`,
`onsearch` e `onrow` existentes no template mais novo. Também possui bindings
sem namespace, manipulação direta de layout e seletores globais. Esses detalhes
explicam o legado, mas não devem ser copiados por uma geração nova: aplicar as
regras atuais de `frontend-plugins.md` e representar mudanças estruturais no
component XML sempre que possível.

No callback de upsert, a resposta `status=error` exibe a mensagem, mas o código
continua e dispara `change` com `id_person` possivelmente ausente. Uma geração
nova deve encerrar o callback após o erro.

### Busca corporativa MuleSoft

`corporativeSearch(args)` aceita três documentos:

```text
ds_docnumber2 -> document
ds_docnumber3 -> passport
ds_rne        -> rne
```

Também aceita os aliases de entrada `passportId` e `foreignResidentId`. CPF,
quando informado, precisa possuir exatamente 11 caracteres. Pelo menos um dos
três documentos é obrigatório.

A API é carregada pelo cadastro `LIB_APIS` de chave `mulesoft_pacientes`:

```js
src.require('LibsApis')('mulesoft_pacientes')
  .withMethod('GET')
  .withBody(paramsParaApi)
  .execute();
```

Para GET, `LibsApis` converte o body em query string. URL, headers, autenticação,
credentials e client HTTP vêm dos cadastros `LIB_APIS`/`LIB_CREDENTIALS` e de
parâmetros traduzidos; não devem ser gravados no source gerado. Status HTTP 504
é tratado como timeout. Ausência de `contentJSON` é tratada como nenhum
registro.

Cada paciente resumido é convertido para a linha da tabela:

- `id_person=''`, marcando origem externa;
- `name -> ds_person`;
- `id -> ds_integration`;
- `birthDate -> dt_born`;
- primeiro contact `email` -> `ds_email1`;
- primeiro contact `mobile` -> `ds_phone1`.

Quando `do_corporative` não está presente, `find(args)` mantém a busca Omni.
Há uma exceção de cliente: `ds_protocolo_sf` consulta quatro tabelas históricas,
obtém o CPF/CNPJ associado, resolve `CRM_PERSON.ID_PERSON` e então executa a
busca local pelo ID.

### Detalhamento e conversão no upsert

O registro resumido selecionado não é gravado diretamente. `upsert(args)` faz
uma segunda chamada a `mulesoft_pacientes`, agora com
`patientId=ds_integration`, e usa o primeiro item de `contentJSON` como payload
detalhado.

Mapeamento direto observado:

| Origem | `CRM_PERSON` | Regra |
| --- | --- | --- |
| `id`/linha selecionada | `DS_INTEGRATION` | código corporativo |
| `cpf` | `DS_DOCNUMBER2` | CPF |
| `passportId` | `DS_DOCNUMBER3` | passaporte |
| `foreignResidentId` | `DS_RNE` | RNE customizado |
| `name`/linha selecionada | `DS_PERSON` | nome |
| `nameSocial` | `DS_NICKNAME` | nome social |
| `birthDate` | `DT_BORN` | nascimento |
| `rg` | `DS_DOCNUMBER1` | RG |
| constante `P` | `DO_PERSONTYPE` | pessoa física |
| `nacionalidade.code` | `ID_NACIONALIDADE_CORP` | campo customizado |

`gender.description` e `gender.code` são normalizados para `DO_SEX`: masculino
ou `m` vira `M`; feminino ou `f` vira `F`; outros e os códigos `d`, `i`, `n` e
`s` viram `O`.

O tipo de público `Paciente` é localizado ou criado em `CRM_PERSONTYPE`. Estado
civil é procurado por código ativo em `CRM_MARITALSTATUS`; o exemplo usa o ID
fixo `9` como fallback. IDs fixos são configuração de cliente e uma geração
automática deve pedir uma chave/regra verificável em vez de reproduzi-los.

Para o primeiro endereço residencial (`type === 1`):

- busca o tipo `Residencial` ativo em `CRM_TPADDRESS`;
- mapeia logradouro, número, complemento, bairro, CEP e código externo;
- usa `LibsCep.cep.findOrCreate()` para país, estado e cidade;
- sem resolução por CEP, usa Brasil, abreviação da UF e nome da cidade como
  fallbacks de `findOrCreate`.

Contatos usam o primeiro valor de cada tipo:

- `email` -> `DS_EMAIL1` e chave externa de email;
- `mobile` -> telefone 3 e chave externa mobile;
- `residential` -> telefone 1 e chave externa residencial.

Telefones são reduzidos a dígitos. Com 12 ou 13 dígitos, os dois primeiros são
DDI, os dois seguintes DDD e o restante é o número. Outros comprimentos são
gravados integralmente no campo de número.

Profissão é localizada em `CRM_JOB` ou criada. Escolaridade, raça/cor e religião
são concatenadas em `DS_OTHERS` como texto descritivo.

Os campos `DS_RNE`, `ID_NACIONALIDADE_CORP` e chaves externas usados neste
exemplo não existem na entity `CRM_PERSON` baixada no ambiente de documentação.
Eles pertencem à modelagem do cliente. Uma automação deve validar a entity do
ambiente alvo antes de produzir qualquer mapping.

### Prioridade de identidade no upsert

A chave não é simplesmente CPF neste exemplo. A prioridade é:

1. se `DS_INTEGRATION` já existir localmente, atualizar por integração;
2. caso contrário, usar CPF quando presente;
3. sem CPF, usar RNE;
4. sem RNE, usar passaporte;
5. sem documento, usar integração.

O `knex.upsert(personData, chaveUpsert)` procura a PK pelo filtro, injeta a PK
no objeto encontrado e atualiza; sem correspondência, insere. O filtro nunca
pode ser vazio. Regras de unicidade e concorrência precisam ser confirmadas no
banco; esse helper, isoladamente, não cria constraint nem transação.

### Uso fora do form: `findOrCreate`

O mesmo source expõe `findOrCreate(args)` para integrações server-side. Ele:

1. valida documentos, nome, nascimento e telefone;
2. exige CPF, RNE ou passaporte;
3. tenta a busca corporativa e faz upsert do primeiro resultado;
4. atualiza o celular informado pelo chamador;
5. se a API não retornar pessoa, procura localmente pelos documentos;
6. sem resultado local, exige nome e cria uma pessoa mínima;
7. retorna um recorte padronizado da pessoa persistida.

Erros da busca corporativa são capturados e ignorados nesse método, permitindo
fallback local. Essa é uma decisão de resiliência específica que deve ser
configurável em uma nova integração, pois pode ocultar indisponibilidade da API.

### Cuidados ao usar o exemplo como referência

O código de produção explica o negócio, mas contém decisões e construções que
uma geração nova deve endurecer:

- validar que `contentJSON` é array não vazio antes de acessar `[0]`;
- tratar a faixa de status HTTP e o contrato de erro da API, não somente 504;
- retornar imediatamente no frontend quando o callback receber
  `status='error'`;
- não assumir que `insert()` retorna um array de IDs; usar o objeto preenchido
  pelo Knex ou consultar pela chave estável, conforme o contrato da versão;
- não hardcodar o ID `9` ou qualquer outra FK sem validar uma chave funcional;
- normalizar casing dos nomes de coluna antes de persistir, inclusive chaves
  externas como `DS_KEY_EMAIL` e `DS_KEY_MOBILE`;
- definir explicitamente se erros corporativos permitem fallback local ou devem
  ser apresentados ao usuário;
- definir se o primeiro resultado corporativo pode ser escolhido
  automaticamente em `findOrCreate`;
- confirmar autorização para criar `CRM_PERSONTYPE`, `CRM_JOB`, país, estado,
  cidade e outros cadastros auxiliares durante uma identificação;
- garantir que o DataTable e os eventos sejam inicializados uma única vez por
  instância do form.

Esses itens fazem parte da validação da especificação automática e devem gerar
pergunta ou erro quando não puderem ser deduzidos de recursos existentes.

## Especificação para geração assistida

Uma implementação automática não deve partir apenas do nome da API. Antes de
gerar ou alterar recursos, reunir e validar a seguinte especificação.

### Recursos existentes

- chave do form principal e confirmação de suporte a form strategy;
- chaves dos component e strategy forms já cadastrados no Studio;
- pattern name `CorporateIdentificationUtils` associado ao source padrão
  `omni.prj.corporateidentification.main.utils`;
- entity `CRM_PERSON` atualizada no workspace;
- chave existente em `LIB_APIS` e, quando aplicável, credentials configuradas.

O fluxo local não cria implicitamente forms, sources, patterns, entities ou
cadastros de API. Recursos ausentes devem ser cadastrados no Studio antes do
download e da alteração assistida.

### Interface

- checkbox, estado inicial e texto;
- campos permitidos na busca corporativa;
- campos adicionais, labels, tipos, layout e seletores;
- botão substituído e região da lista;
- colunas e ordenação do DataTable;
- contextos adicionais, como telefonia ou protocolo;
- comportamento ao pressionar Enter e ao alternar o checkbox.

### API de busca

- chave `LIB_APIS`, método, rota e parâmetros;
- documentos aceitos, aliases e normalização;
- validações antes da chamada;
- caminho da lista no response e critério de “sem resultados”;
- mapping do resultado resumido para as colunas;
- timeout, erros HTTP, mensagem e política de fallback local.

### Detalhamento e persistência

- se a seleção exige segunda chamada de detalhe;
- mapping completo origem -> `CRM_PERSON` com conversores;
- campos customizados e confirmação de existência na entity;
- defaults e domínios, inclusive gênero e tipo de pessoa;
- FKs que somente consultam e FKs que podem criar cadastros auxiliares;
- política para endereço, CEP e contatos múltiplos;
- prioridade das chaves de identidade;
- comportamento de insert versus update e campos que podem sobrescrever dados
  locais;
- transação, unicidade e tratamento de concorrência;
- contrato de sucesso/erro e retorno obrigatório de `id_person`.

### Artefatos e validação

Com a especificação completa, a alteração assistida pode produzir:

- XML do component form sem tocar no form principal;
- JavaScript/CSS do strategy form com eventos delegados, namespaced e
  idempotentes;
- implementação dos pontos corporativos de `find` e do mapping/upsert em
  `omni.prj.corporateidentification.main.utils`;
- tabela de mapping conferida contra a entity;
- roteiro de testes para busca local, cada documento corporativo, API vazia,
  timeout, seleção local, insert, update por cada chave e falha de conversão.

Antes de publicar, validar que nenhum arquivo do form principal foi modificado,
que todos os fields referenciados existem após a composição e que cada coluna
persistida pertence à entity do ambiente alvo.
