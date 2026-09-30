/**
 * Ponto de entrada do app do Google Chat.
 *
 * Recebe os eventos do Chat, conduz a conversa com o apoio da IA (Gemini.gs) e,
 * quando necessário, escala o atendimento para um chamado no GLPI (Glpi.gs).
 */

/** Evento de mensagem recebida. */
function onMessage(event) {
  try {
    return tratarMensagem(event);
  } catch (erro) {
    console.log('ERRO onMessage: ' + erro);
    return respostaTexto('Ocorreu um erro no atendimento automático. Vou abrir um chamado para um técnico revisar.');
  }
}

/** Evento disparado quando o app é adicionado a uma conversa. */
function onAddedToSpace(event) {
  return respostaTexto('Olá! Sou o assistente de TI da ' + SIGLA_ORGANIZACAO + '. Me conte qual é o problema que você está enfrentando que eu tento ajudar, e se não conseguir resolver, posso abrir um chamado para um técnico.');
}

/** Comando de app (reinicia o atendimento). */
function onAppCommand(event) {
  limparEstado(idDoUsuario(event));
  return respostaTexto('Atendimento reiniciado. Qual é o problema?');
}

/** Evento disparado quando o app é removido de uma conversa. */
function onRemovedFromSpace(event) {
  console.log('Bot removido do espaco.');
}

/** Monta a resposta no formato esperado pelo Google Chat (complemento do Workspace). */
function respostaTexto(texto) {
  return { hostAppDataAction: { chatDataAction: { createMessageAction: { message: { text: texto } } } } };
}

function idDoUsuario(event) {
  return event.chat && event.chat.user && event.chat.user.name ? event.chat.user.name : 'desconhecido';
}

function nomeDoUsuario(event) {
  return event.chat && event.chat.user && event.chat.user.displayName ? event.chat.user.displayName : '';
}

function textoDaMensagem(event) {
  return event.chat && event.chat.messagePayload && event.chat.messagePayload.message && event.chat.messagePayload.message.text ? event.chat.messagePayload.message.text : '';
}

function contemPalavra(textoBusca, listaPalavras) {
  for (var i = 0; i < listaPalavras.length; i++) {
    if (textoBusca.indexOf(listaPalavras[i]) !== -1) return true;
  }
  return false;
}

/**
 * Fluxo principal de atendimento.
 *
 * 1. Recupera a memória da conversa (reinicia após inatividade).
 * 2. Se o usuário pedir um técnico, escala direto para o GLPI.
 * 3. Caso contrário, consulta a IA, que responde em JSON estruturado.
 * 4. Controla a proposta e a confirmação de abertura de chamado.
 */
function tratarMensagem(event) {
  var id = idDoUsuario(event);
  var nomeUsuario = nomeDoUsuario(event);
  var texto = textoDaMensagem(event).trim();
  var textoBusca = texto.toLowerCase();

  var estado = lerEstado(id);
  if (estado.ultimaInteracao && (Date.now() - estado.ultimaInteracao) > LIMITE_INATIVIDADE_MS) {
    limparEstado(id);
    estado = { historico: [], aguardandoConfirmacao: false, categoriaProposta: null, resumoProblema: '', ultimaInteracao: null };
  }

  if (contemPalavra(textoBusca, ['abrir chamado', 'falar com tecnico', 'falar com técnico', 'atendente humano', 'quero um tecnico', 'quero um técnico'])) {
    var resumoRapido = estado.resumoProblema || resumirHistorico(estado.historico) || texto;
    var categoriaRapida = estado.categoriaProposta || GLPI_CATEGORIA_PADRAO;
    salvarEstado(id, estado);
    return escalarParaGlpi(id, nomeUsuario, resumoRapido, categoriaRapida);
  }

  var contentsParaEnviar = estado.historico.slice(-MAX_HISTORICO_ENVIO).concat([{ role: 'user', parts: [{ text: texto }] }]);

  var ia;
  try {
    ia = consultarGemini(contentsParaEnviar, estado, nomeUsuario);
  } catch (erroIa) {
    console.log('ERRO consultarGemini: ' + erroIa);
    return respostaTexto('Desculpa, tive um problema para processar sua mensagem agora. Pode tentar novamente? Se preferir, digite "falar com técnico" que eu abro um chamado direto.');
  }

  var respostaFinal = ia.resposta || 'Não entendi bem, pode explicar de outro jeito?';
  estado.historico = contentsParaEnviar.concat([{ role: 'model', parts: [{ text: respostaFinal }] }]);

  if (estado.aguardandoConfirmacao && ia.confirmar_abertura) {
    var categoriaFinal = estado.categoriaProposta || mapearCategoria(ia.categoria);
    var resumoFinal = estado.resumoProblema || ia.resumo || texto;
    salvarEstado(id, estado);
    return escalarParaGlpi(id, nomeUsuario, resumoFinal, categoriaFinal);
  }

  if (estado.aguardandoConfirmacao && ia.cancelar_chamado) {
    estado.aguardandoConfirmacao = false;
    estado.categoriaProposta = null;
    estado.resumoProblema = '';
    salvarEstado(id, estado);
    return respostaTexto(respostaFinal);
  }

  if (!estado.aguardandoConfirmacao && ia.propor_chamado) {
    estado.aguardandoConfirmacao = true;
    estado.categoriaProposta = mapearCategoria(ia.categoria);
    estado.resumoProblema = ia.resumo || texto;
    salvarEstado(id, estado);
    return respostaTexto(respostaFinal);
  }

  salvarEstado(id, estado);
  return respostaTexto(respostaFinal);
}

/** Junta as mensagens do usuário para usar como descrição do chamado. */
function resumirHistorico(historico) {
  if (!historico || !historico.length) return '';
  var mensagensUsuario = [];
  for (var i = 0; i < historico.length; i++) {
    if (historico[i].role === 'user' && historico[i].parts && historico[i].parts[0]) {
      mensagensUsuario.push(historico[i].parts[0].text);
    }
  }
  return mensagensUsuario.join(' / ').slice(0, 500);
}

/** Converte a categoria devolvida pela IA no ID de categoria do GLPI. */
function mapearCategoria(categoria) {
  if (categoria === 'senha') return GLPI_CATEGORIA_SENHA;
  if (categoria === 'impressora') return GLPI_CATEGORIA_IMPRESSORA;
  if (categoria === 'rede') return GLPI_CATEGORIA_REDE;
  if (categoria === 'academico') return GLPI_CATEGORIA_ACADEMICO;
  return GLPI_CATEGORIA_PADRAO;
}
