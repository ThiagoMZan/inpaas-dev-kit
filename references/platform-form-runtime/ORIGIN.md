# Runtime frontend de forms

Esta pasta cataloga os arquivos estáticos que participam da renderização e do
comportamento frontend dos forms tradicionais.

## Fonte canônica disponível

Versão de referência: `2.7.67-dev`.

Os arquivos core já existem no co-workspace da plataforma e devem ser lidos
diretamente de suas fontes, sem manter cópias neste diretório:

```text
C:\Users\tzan\www\platform-java-src-2.7.67-dev\web-inpaas\src\main\webapp\web\js\
├── inpaas-default.js
├── inpaas-libs.js
├── inpaas-dyna-form.js
├── inpaas-studio.js
├── rest-api.js
└── outros arquivos web da plataforma

C:\Users\tzan\www\platform-java-src-2.7.67-dev\web-inpaas\src\main\webapp\web\css\
├── inpaas.css
├── inpaas-main.css
├── inpaas-studio.css
└── outros estilos web da plataforma
```

Dependências de terceiros empacotadas pela versão estão em:

```text
C:\Users\tzan\www\platform-java-src-2.7.67-dev\web-static\src\main\assets\
```

Usar preferencialmente `src/main`, não `target`, para evitar analisar duas
cópias do mesmo asset gerado pelo build.

## O que colocar nesta pasta

Adicionar somente arquivos que não estejam no co-workspace ou que sejam
diferentes no ambiente em execução, por exemplo:

- plugins estáticos proprietários adicionados à instalação;
- versões modificadas de arquivos core;
- bundles fornecidos por outro módulo ou extensão;
- CSS necessário para compreender os seletores usados pelos plugins;
- source maps úteis para recuperar uma versão legível.

Preservar o caminho da URL dentro desta pasta sempre que possível:

```text
platform-form-runtime/
├── ORIGIN.md
├── web/
│   ├── js/
│   └── css/
└── assets/
```

Para cada arquivo adicionado, registrar abaixo:

- URL original;
- ambiente e versão;
- data da coleta;
- motivo pelo qual difere ou não existe no co-workspace;
- form ou cenário em que foi observado.

## Arquivos adicionais

Nenhum arquivo adicional registrado até o momento.

## Uso na documentação

Os assets são evidência de implementação, não recursos publicáveis do projeto.
Comportamentos confirmados neles devem ser resumidos em
`docs/form-design.md` do repositório `inpaas-ai-knowledge`, relacionando:

```text
atributo/propriedade do XML
    -> HTML produzido pelo renderer Java
    -> seletor e inicialização no JavaScript
    -> evento ou chamada HTTP
    -> efeito visual e persistência
```

Não documentar como contrato um detalhe encontrado apenas em código minificado
ou em uma versão divergente sem registrar essa origem.
