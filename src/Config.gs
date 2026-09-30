/**
 * Configurações do assistente.
 *
 * Personalize estes valores para a sua organização. Credenciais (chaves de API,
 * usuário e senha do GLPI) NUNCA ficam aqui: elas são lidas das Propriedades do
 * Script (veja docs/configuracao.md).
 */

// Identidade da organização usada nas mensagens e nas instruções da IA.
var NOME_ORGANIZACAO = 'Faculdade Exemplo';
var SIGLA_ORGANIZACAO = 'FE';

// IDs das categorias de chamado no GLPI (ajuste para os IDs do seu ambiente).
var GLPI_CATEGORIA_SENHA = 33;
var GLPI_CATEGORIA_IMPRESSORA = 3;
var GLPI_CATEGORIA_REDE = 10;
var GLPI_CATEGORIA_ACADEMICO = 25;
var GLPI_CATEGORIA_PADRAO = 5;

// Memória da conversa.
var LIMITE_INATIVIDADE_MS = 60 * 60 * 1000; // reinicia o atendimento após 1 h sem mensagens
var MAX_HISTORICO = 16;                      // mensagens guardadas por usuário
var MAX_HISTORICO_ENVIO = 8;                 // mensagens enviadas ao modelo a cada chamada

/**
 * Base de conhecimento de nível 1 usada pela IA.
 * Substitua pelos procedimentos reais da sua organização. Nunca coloque senhas
 * padrão ou dados pessoais aqui: o assistente pode repetir este conteúdo no chat.
 */
var BASE_CONHECIMENTO = [
  '- Conta Google institucional (Gmail/Drive/Meet): para recuperar a senha, a pessoa deve clicar em "Esqueci minha senha" na tela de login do Gmail e seguir a recuperação por e-mail/telefone alternativo.',
  '- AVA (ambiente virtual de aprendizagem): para recuperar a senha, clicar em "Esqueci minha senha" na tela de login.',
  '- Portal acadêmico/financeiro: se a pessoa já trocou a senha e esqueceu, só a secretaria consegue redefinir.',
  '- Impressoras: em notebook, é preciso estar com a VPN da instituição ativada para imprimir de fora; em computador fixo não precisa de VPN, mas precisa estar na rede interna. Sempre verificar cabo, se está ligada e se tem papel/tinta.',
  '- Pasta/unidade de rede: geralmente resolve fazendo logout/login no computador; de fora da instituição precisa de VPN ativa.',
  '- Wi-Fi/rede sem fio: peça para a pessoa esquecer a rede e reconectar digitando a senha novamente, verificar se o Wi-Fi do aparelho está ligado e se está tentando entrar na rede certa; se persistir mesmo perto do roteador, trate como possível problema de infraestrutura (categoria rede).',
  '- Sistema acadêmico/AVA travando ou sem acesso à disciplina: tentar logout/login e abrir em aba anônima (sem estar logado em outra conta Google ao mesmo tempo) geralmente resolve.'
];
