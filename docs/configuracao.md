# Guia de implantação

Passo a passo para colocar o assistente em funcionamento no Google Workspace da sua organização.

## 1. Pré-requisitos

- Google Workspace com o Google Chat ativo.
- Um projeto no Google Cloud (para ativar a Google Chat API).
- Uma chave da API Gemini, criada no [Google AI Studio](https://aistudio.google.com/).
- GLPI com a API v2 e o OAuth2 habilitados, e uma conta de serviço com permissão para criar chamados.

## 2. Projeto no Apps Script

1. Crie um projeto em [script.google.com](https://script.google.com/).
2. Crie os arquivos `Config`, `Main`, `Estado`, `Gemini` e `Glpi` e cole o conteúdo de cada arquivo de `src/`. A ordem não importa: no Apps Script, todos os arquivos compartilham o mesmo escopo.
3. Em **Configurações do projeto**, marque "Mostrar o arquivo de manifesto appsscript.json no editor" e substitua o conteúdo pelo de `src/appsscript.json`.

> Também dá para sincronizar a pasta `src/` com o Apps Script usando o [clasp](https://github.com/google/clasp), a ferramenta de linha de comando do Google.

## 3. Propriedades do Script

Em **Configurações do projeto → Propriedades do script**, cadastre:

| Propriedade | Obrigatória | Descrição |
|---|---|---|
| `GEMINI_API_KEY` | sim | Chave da API Gemini |
| `GEMINI_MODEL` | não | Modelo principal (padrão: `gemini-flash-latest`) |
| `GLPI_API_URL` | sim | URL base da API v2 do GLPI |
| `GLPI_CLIENT_ID` | sim | ID do cliente OAuth cadastrado no GLPI |
| `GLPI_CLIENT_SECRET` | sim | Segredo do cliente OAuth |
| `GLPI_USUARIO` | sim | Usuário da conta de serviço no GLPI |
| `GLPI_SENHA` | sim | Senha da conta de serviço |
| `GLPI_URL_PAINEL` | não | URL do GLPI, para enviar o link do chamado ao usuário |

## 4. Personalização

Em `src/Config.gs`, ajuste:

- `NOME_ORGANIZACAO` e `SIGLA_ORGANIZACAO`;
- os IDs das categorias de chamado do seu GLPI;
- a `BASE_CONHECIMENTO` com os procedimentos de nível 1 da sua equipe.

> Nunca coloque senhas padrão ou dados pessoais na base de conhecimento: o assistente pode repetir esse conteúdo no chat.

## 5. Google Cloud e Google Chat

1. Em **Configurações do projeto** do Apps Script, vincule o projeto do Google Cloud.
2. No Google Cloud, ative a **Google Chat API**.
3. Na configuração da Chat API, preencha nome, avatar e descrição do app e, em **Configurações de conexão**, aponte para o projeto do Apps Script usando o ID da implantação.
4. Em **Visibilidade**, comece liberando o app só para algumas pessoas de teste.

## 6. GLPI

1. Cadastre um cliente OAuth com o tipo de concessão *password* e o escopo `api`.
2. Crie uma conta de serviço para o assistente, com um perfil que permita criar chamados na entidade certa.
3. Se o GLPI roda em Apache com PHP-FPM/CGI, confira se o cabeçalho `Authorization` chega até o PHP (por exemplo, com `CGIPassAuth On`). Sem isso, o token é gerado normalmente, mas a abertura do chamado responde **401**.

Teste rápido no servidor:

```bash
curl -X POST "$GLPI_API_URL/Assistance/Ticket" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"name": "Teste", "content": "Teste da API"}'
```

## 7. Implantação

1. No Apps Script, clique em **Implantar → Nova implantação** (ou, para atualizar, **Gerenciar implantações → editar → Nova versão**).
2. Converse com o app no Google Chat: um "oi" já deve ser respondido pela IA.
3. Acompanhe erros em **Execuções** e no Cloud Logging. O código registra `ERRO` e `AVISO` com o motivo de cada falha.

## Custos e limites

O nível gratuito da API Gemini tem limites diários baixos e pode usar o conteúdo enviado para melhorar os produtos do Google. Para uso real, principalmente com dados de pessoas, ative o faturamento no projeto do Google Cloud. Consulte a [página de preços](https://ai.google.dev/gemini-api/docs/pricing).
