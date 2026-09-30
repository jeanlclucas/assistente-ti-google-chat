/**
 * Testes do fluxo de atendimento, rodando o código do Apps Script em Node.
 *
 * Os serviços do Google (CacheService, PropertiesService, UrlFetchApp) são
 * simulados, assim como as respostas da API Gemini e do GLPI.
 *
 * Executar: npm test   (ou: node --test)
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ARQUIVOS = ['Config.gs', 'Estado.gs', 'Gemini.gs', 'Glpi.gs', 'Main.gs'];

/** Cria um ambiente isolado com os serviços do Apps Script simulados. */
function criarAmbiente({ gemini = [], glpiTicket = [], props = {} } = {}) {
  const cache = new Map();
  const chamadas = [];
  const logs = [];
  const filaGemini = [...gemini];
  const filaTicket = [...glpiTicket];

  const resposta = (codigo, corpo) => ({
    getResponseCode: () => codigo,
    getContentText: () => (typeof corpo === 'string' ? corpo : JSON.stringify(corpo))
  });

  const ctx = {
    console: { log: (m) => logs.push(String(m)) },
    CacheService: {
      getScriptCache: () => ({
        get: (k) => (cache.has(k) ? cache.get(k) : null),
        put: (k, v) => cache.set(k, v),
        remove: (k) => cache.delete(k)
      })
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => ({
          GEMINI_API_KEY: 'chave-teste',
          GLPI_API_URL: 'https://glpi.exemplo.com/api.php/v2',
          GLPI_CLIENT_ID: 'cliente',
          GLPI_CLIENT_SECRET: 'segredo',
          GLPI_USUARIO: 'bot',
          GLPI_SENHA: 'senha',
          GLPI_URL_PAINEL: 'https://glpi.exemplo.com',
          ...props
        })[k] || null
      })
    },
    Utilities: { sleep: () => {} },
    UrlFetchApp: {
      fetch: (url, opcoes) => {
        chamadas.push({ url, opcoes });
        if (url.includes('generativelanguage.googleapis.com')) {
          const r = filaGemini.shift();
          if (!r) throw new Error('Chamada inesperada ao Gemini');
          return r.erro
            ? resposta(r.erro, { error: 'simulado' })
            : resposta(200, { candidates: [{ content: { parts: [{ text: JSON.stringify(r) }] } }] });
        }
        if (url.endsWith('/token')) {
          return resposta(200, { access_token: 'token-teste', expires_in: 3600 });
        }
        if (url.endsWith('/Assistance/Ticket')) {
          const r = filaTicket.shift();
          if (!r) throw new Error('Chamada inesperada ao GLPI');
          return resposta(r.codigo, r.corpo);
        }
        throw new Error('URL inesperada: ' + url);
      }
    }
  };

  vm.createContext(ctx);
  for (const arquivo of ARQUIVOS) {
    const codigo = fs.readFileSync(path.join(__dirname, '..', 'src', arquivo), 'utf8');
    vm.runInContext(codigo, ctx, { filename: arquivo });
  }

  return {
    ctx,
    cache,
    chamadas,
    logs,
    enviar: (texto, usuario = 'users/123', nome = 'Maria') => {
      const evento = { chat: { user: { name: usuario, displayName: nome }, messagePayload: { message: { text: texto } } } };
      const r = ctx.onMessage(evento);
      return r.hostAppDataAction.chatDataAction.createMessageAction.message.text;
    },
    estado: (usuario = 'users/123') => {
      const bruto = cache.get('estado_' + usuario);
      return bruto ? JSON.parse(bruto) : null;
    },
    chamadasGemini: () => chamadas.filter((c) => c.url.includes('generativelanguage')),
    chamadasTicket: () => chamadas.filter((c) => c.url.endsWith('/Assistance/Ticket')),
    chamadasToken: () => chamadas.filter((c) => c.url.endsWith('/token'))
  };
}

const ia = (campos) => ({
  resposta: '',
  propor_chamado: false,
  confirmar_abertura: false,
  cancelar_chamado: false,
  categoria: 'outro',
  resumo: '',
  ...campos
});

test('responde a uma saudação usando a IA e guarda o histórico', () => {
  const amb = criarAmbiente({ gemini: [ia({ resposta: 'Olá, Maria! Qual é o problema?' })] });

  const texto = amb.enviar('bom dia');

  assert.equal(texto, 'Olá, Maria! Qual é o problema?');
  assert.equal(amb.estado().historico.length, 2);
  assert.equal(amb.estado().aguardandoConfirmacao, false);
});

test('fluxo completo: propõe chamado, usuário confirma e o chamado é aberto no GLPI', () => {
  const amb = criarAmbiente({
    gemini: [
      ia({ resposta: 'Posso abrir um chamado? (sim ou não)', propor_chamado: true, categoria: 'impressora', resumo: 'Impressora do bloco B não imprime' }),
      ia({ resposta: 'Certo!', confirmar_abertura: true })
    ],
    glpiTicket: [{ codigo: 201, corpo: { id: 123 } }]
  });

  amb.enviar('a impressora do bloco B não imprime');
  assert.equal(amb.estado().aguardandoConfirmacao, true);
  assert.equal(amb.estado().categoriaProposta, amb.ctx.GLPI_CATEGORIA_IMPRESSORA);

  const texto = amb.enviar('sim');

  assert.match(texto, /Protocolo: #123/);
  assert.match(texto, /ticket\.form\.php\?id=123/);
  assert.equal(amb.estado(), null, 'a conversa deve ser encerrada após abrir o chamado');

  const chamado = JSON.parse(amb.chamadasTicket()[0].opcoes.payload);
  assert.equal(chamado.content, 'Impressora do bloco B não imprime');
  assert.equal(chamado.category.id, amb.ctx.GLPI_CATEGORIA_IMPRESSORA);
  assert.equal(amb.chamadasTicket()[0].opcoes.headers.Authorization, 'Bearer token-teste');
});

test('mantém a conversa quando o GLPI falha, para o usuário tentar de novo (correção da v24)', () => {
  const amb = criarAmbiente({
    gemini: [
      ia({ resposta: 'Posso abrir um chamado? (sim ou não)', propor_chamado: true, categoria: 'rede', resumo: 'Sem internet no laboratório 3' }),
      ia({ resposta: 'Certo!', confirmar_abertura: true })
    ],
    glpiTicket: [
      { codigo: 401, corpo: { status: 'ERROR_UNAUTHENTICATED' } },
      { codigo: 401, corpo: { status: 'ERROR_UNAUTHENTICATED' } }
    ]
  });

  amb.enviar('estou sem internet no laboratório 3');
  const texto = amb.enviar('sim');

  assert.match(texto, /não perdi o que você me contou/);
  assert.equal(amb.estado().resumoProblema, 'Sem internet no laboratório 3');
  assert.equal(amb.chamadasToken().length, 2, 'deve renovar o token uma vez após o 401');
});

test('usa o modelo reserva quando o modelo principal está indisponível', () => {
  const amb = criarAmbiente({ gemini: [{ erro: 429 }, ia({ resposta: 'Resposta do modelo reserva' })] });

  const texto = amb.enviar('meu computador está lento');

  assert.equal(texto, 'Resposta do modelo reserva');
  const [primeira, segunda] = amb.chamadasGemini();
  assert.match(primeira.url, /models\/gemini-flash-latest:/);
  assert.match(segunda.url, /models\/gemini-flash-lite-latest:/);
});

test('pedido direto de técnico abre o chamado sem consultar a IA', () => {
  const amb = criarAmbiente({ glpiTicket: [{ codigo: 201, corpo: { id: 77 } }] });

  const texto = amb.enviar('quero falar com técnico');

  assert.match(texto, /Protocolo: #77/);
  assert.equal(amb.chamadasGemini().length, 0);
  assert.equal(JSON.parse(amb.chamadasTicket()[0].opcoes.payload).category.id, amb.ctx.GLPI_CATEGORIA_PADRAO);
});

test('reinicia a conversa depois de 1 hora sem mensagens', () => {
  const amb = criarAmbiente({ gemini: [ia({ resposta: 'Olá! Como posso ajudar?' })] });
  const duasHorasAtras = Date.now() - 2 * 60 * 60 * 1000;
  amb.cache.set('estado_users/123', JSON.stringify({
    historico: [{ role: 'user', parts: [{ text: 'mensagem antiga' }] }],
    aguardandoConfirmacao: true,
    categoriaProposta: 3,
    resumoProblema: 'problema antigo',
    ultimaInteracao: duasHorasAtras
  }));

  amb.enviar('oi');

  const corpo = JSON.parse(amb.chamadasGemini()[0].opcoes.payload);
  assert.equal(corpo.contents.length, 1, 'o histórico antigo não deve ser enviado');
  assert.doesNotMatch(corpo.systemInstruction.parts[0].text, /ESTADO ATUAL/);
  assert.equal(amb.estado().aguardandoConfirmacao, false);
});

test('falha da IA gera uma resposta amigável em vez de erro', () => {
  const amb = criarAmbiente({ gemini: [{ erro: 500 }, { erro: 500 }] });

  const texto = amb.enviar('não consigo acessar o AVA');

  assert.match(texto, /tive um problema para processar sua mensagem/);
  assert.ok(amb.logs.some((l) => l.startsWith('ERRO consultarGemini')));
});

test('reaproveita o token do GLPI em cache entre chamados', () => {
  const amb = criarAmbiente({
    glpiTicket: [{ codigo: 201, corpo: { id: 1 } }, { codigo: 201, corpo: { id: 2 } }]
  });

  amb.enviar('abrir chamado', 'users/1');
  amb.enviar('abrir chamado', 'users/2');

  assert.equal(amb.chamadasTicket().length, 2);
  assert.equal(amb.chamadasToken().length, 1);
});
