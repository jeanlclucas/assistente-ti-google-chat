# Histórico de versões

## [1.0.0] — versão pública (setembro/2026)

- Código organizado em módulos: `Config`, `Main`, `Estado`, `Gemini` e `Glpi`.
- Dados institucionais removidos; nome da organização, categorias e base de conhecimento passam a ser configurados em `Config.gs`.
- Testes automatizados simulando o Google Chat, a API do Gemini e o GLPI.
- Guia de implantação em `docs/configuracao.md`.

## Histórico do desenvolvimento

Versões implantadas no Apps Script durante o desenvolvimento em ambiente real.

### Versão 24 — 22/09/2026
- **Correção:** a memória da conversa só é apagada depois que o GLPI confirma a abertura do chamado. Antes, uma falha na abertura fazia o assistente "esquecer" tudo e repetir as perguntas.
- Mensagem de falha mais clara, avisando que nada se perdeu e que dá para tentar de novo.

### Versão 23 — 22/09/2026
- **Correção:** uma tentativa por modelo de IA (antes eram duas), para não estourar o tempo de resposta do Google Chat quando o modelo está lento ou sobrecarregado.

### Versão 22 — 18/09/2026
- Melhorias nas instruções da IA (Wi-Fi, regra contra respostas inventadas) e de eficiência (histórico limitado a 8 mensagens, limite de tokens de resposta).

### Versão 21 — 15/09/2026
- Integração com o GLPI reescrita para a API v2 com OAuth2 (client_id/secret + password grant).

### Versão 20 — 15/09/2026
- Modelo principal com fallback automático para um modelo reserva, contra sobrecarga da API.

### Versão 18 — 15/09/2026
- Atualização do modelo do Gemini (versão anterior descontinuada).

### Versão 17 — 15/09/2026
- **Integração com a API Gemini:** o fluxo de regras fixas foi substituído por um técnico virtual com IA que entende linguagem natural.

### Versão 16 — 14/09/2026
- Saudação e cordialidade; reinício do atendimento após 1 hora de inatividade.

### Versão 15 — 14/09/2026
- Mapeamento de categorias do GLPI por tipo de problema (senha, impressora, rede, acadêmico, padrão).

### Versão 14 — 14/09/2026
- Fluxo de senha com autoatendimento, fluxos de rede, acadêmico e genérico, e integração completa com o GLPI.

### Versão 13 — 14/09/2026
- Diferencia notebook e computador fixo no fluxo de impressora, pede confirmação antes de abrir chamado e devolve protocolo, link e aviso de e-mail.

### Versão 12 — 14/09/2026
- Triagem de nível 1 (senha, impressora/VPN, fluxo genérico) e escalonamento automático para o GLPI via API REST.

### Versão 11 — 14/09/2026
- Formato de resposta ajustado para o modo complemento do Google Workspace.

### Versões 5 a 10 — julho/2026
- Protótipo inicial com fluxo de regras fixas.
