/**
 * Integração com o GLPI (API v2, autenticação OAuth2).
 *
 * O token de acesso fica em cache até perto de expirar. Se a abertura do chamado
 * receber 401, o token é descartado, renovado e a chamada é repetida uma vez.
 */

/**
 * Abre o chamado e responde ao usuário. A memória da conversa só é apagada
 * depois que o GLPI confirma a abertura: se algo falhar, nada do que o usuário
 * contou se perde e ele pode tentar de novo.
 */
function escalarParaGlpi(id, nomeUsuario, descricao, categoriaId) {
  try {
    var protocolo = glpiAbrirChamado(nomeUsuario, descricao, categoriaId);
    limparEstado(id);
    var msg = 'Prontinho, já abri um chamado para o suporte de TI continuar o atendimento.\nProtocolo: #' + protocolo;
    var link = linkDoChamado(protocolo);
    if (link) {
      msg += '\nAcompanhe por aqui: ' + link;
    }
    msg += '\nVocê também pode acompanhar as atualizações pelo seu e-mail, caso prefira.';
    return respostaTexto(msg);
  } catch (erro) {
    console.log('ERRO escalarParaGlpi: ' + erro);
    return respostaTexto('Tive um problema técnico ao abrir o chamado agora (falha de comunicação com o sistema de chamados). Não se preocupe, não perdi o que você me contou - pode digitar "abrir chamado" de novo em alguns instantes para eu tentar outra vez, ou falar direto com o suporte de TI se for urgente.');
  }
}

function linkDoChamado(protocolo) {
  var props = PropertiesService.getScriptProperties();
  var painel = props.getProperty('GLPI_URL_PAINEL');
  if (!painel) return null;
  return painel.replace(/\/$/, '') + '/front/ticket.form.php?id=' + protocolo;
}

function glpiConfig() {
  var props = PropertiesService.getScriptProperties();
  return {
    apiUrl: props.getProperty('GLPI_API_URL'),
    clientId: props.getProperty('GLPI_CLIENT_ID'),
    clientSecret: props.getProperty('GLPI_CLIENT_SECRET'),
    usuario: props.getProperty('GLPI_USUARIO'),
    senha: props.getProperty('GLPI_SENHA')
  };
}

/** Obtém (ou reaproveita do cache) o token OAuth2 do GLPI. */
function glpiObterToken() {
  var cache = CacheService.getScriptCache();
  var tokenCache = cache.get('glpi_access_token');
  if (tokenCache) return tokenCache;

  var cfg = glpiConfig();
  if (!cfg.apiUrl || !cfg.clientId || !cfg.clientSecret || !cfg.usuario || !cfg.senha) {
    throw new Error('Credenciais do GLPI nao configuradas nas Propriedades do Script (GLPI_API_URL, GLPI_CLIENT_ID, GLPI_CLIENT_SECRET, GLPI_USUARIO, GLPI_SENHA).');
  }

  var payload = {
    grant_type: 'password',
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    username: cfg.usuario,
    password: cfg.senha,
    scope: 'api'
  };

  var resposta = UrlFetchApp.fetch(cfg.apiUrl.replace(/\/$/, '') + '/token', {
    method: 'post',
    contentType: 'application/x-www-form-urlencoded',
    payload: payload,
    muteHttpExceptions: true
  });

  var codigo = resposta.getResponseCode();
  var corpo = resposta.getContentText();
  if (codigo < 200 || codigo >= 300) {
    throw new Error('GLPI OAuth token retornou ' + codigo + ': ' + corpo);
  }

  var dados = JSON.parse(corpo);
  if (!dados.access_token) {
    throw new Error('GLPI OAuth token sem access_token: ' + corpo);
  }

  var ttl = (dados.expires_in || 3600) - 60; // renova 1 min antes de expirar
  if (ttl < 60) ttl = 60;
  cache.put('glpi_access_token', dados.access_token, ttl);
  return dados.access_token;
}

/** Cria o chamado no GLPI e devolve o número (protocolo). */
function glpiAbrirChamado(nomeUsuario, descricao, categoriaId) {
  var cfg = glpiConfig();
  var token = glpiObterToken();
  var payload = {
    name: 'Chamado via Chat - ' + nomeUsuario,
    content: descricao,
    urgency: 3,
    impact: 3,
    priority: 3,
    type: 1,
    category: { id: categoriaId || GLPI_CATEGORIA_PADRAO }
  };

  var resposta = UrlFetchApp.fetch(cfg.apiUrl.replace(/\/$/, '') + '/Assistance/Ticket', {
    method: 'post',
    contentType: 'application/json',
    headers: { 'Authorization': 'Bearer ' + token },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
  var codigo = resposta.getResponseCode();
  var corpo = resposta.getContentText();

  if (codigo === 401) {
    CacheService.getScriptCache().remove('glpi_access_token');
    token = glpiObterToken();
    resposta = UrlFetchApp.fetch(cfg.apiUrl.replace(/\/$/, '') + '/Assistance/Ticket', {
      method: 'post',
      contentType: 'application/json',
      headers: { 'Authorization': 'Bearer ' + token },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
    codigo = resposta.getResponseCode();
    corpo = resposta.getContentText();
  }

  var dados = JSON.parse(corpo);
  if (dados && dados.id) return dados.id;
  throw new Error('GLPI Ticket retornou ' + codigo + ': ' + corpo);
}
