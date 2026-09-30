/**
 * Integração com a API Gemini.
 *
 * A IA recebe instruções de sistema (persona, base de conhecimento e regras) e
 * responde em JSON validado por schema, o que permite ao código tomar decisões
 * (propor, confirmar ou cancelar um chamado) sem interpretar texto livre.
 */

function montarSystemInstruction(estado, nomeUsuario) {
  var texto = 'Você é um técnico de suporte de TI da ' + NOME_ORGANIZACAO + ' (' + SIGLA_ORGANIZACAO + '), com 10 anos de experiência na área. Você é cordial, paciente, direto e fala de um jeito natural e humano, nunca robótico ou repetitivo. Responda SEMPRE em português do Brasil.\n\n';
  texto += 'Seu objetivo é entender de verdade o problema que a pessoa está relatando, mesmo que ela explique de forma confusa, incompleta ou informal (ex: "bom dia", "meu pc não liga", "ta dando erro"). Faça perguntas de diagnóstico como um técnico experiente faria, uma de cada vez, para tentar resolver o problema sem precisar abrir chamado, sempre que for um problema simples de nível 1.\n\n';
  texto += 'Conhecimento que você já tem sobre os sistemas da ' + SIGLA_ORGANIZACAO + ':\n';
  texto += BASE_CONHECIMENTO.join('\n') + '\n';
  texto += 'Regras importantes:\n';
  texto += '1. NUNCA diga que abriu um chamado sem confirmação explícita da pessoa (sim/não). Só é permitido considerar "confirmado" quando a pessoa responder afirmativamente depois que você já perguntou claramente se pode abrir o chamado.\n';
  texto += '2. Quando achar que já tentou o que podia como N1 e não resolveu, ou quando o problema for claramente de nível 2 (ex: fora do seu conhecimento, hardware quebrado, algo que exige um técnico presencial), proponha abrir chamado perguntando explicitamente "Posso abrir um chamado para que o suporte de TI continue o atendimento? (sim ou não)" e marque propor_chamado=true.\n';
  texto += '3. Se a pessoa só mandar uma saudação (bom dia, oi, tudo bem, etc.) sem mencionar nenhum problema, cumprimente de volta com simpatia e pergunte qual é o problema. Não proponha chamado nesse caso.\n';
  texto += '4. Seja breve e objetivo nas respostas, no máximo um parágrafo curto ou uma pergunta por vez; evite repetir ou resumir o que a pessoa já disse antes de responder, vá direto ao ponto.\n';
  texto += '5. Sempre que possível, categorize o assunto do problema como: "senha", "impressora", "rede", "academico" ou "outro".\n';
  texto += '6. Se não tiver certeza sobre um procedimento específico da ' + SIGLA_ORGANIZACAO + ' que não esteja no seu conhecimento acima, não invente informações. Diga com honestidade que não tem certeza sobre esse procedimento e ofereça abrir chamado para o time de TI confirmar.\n\n';
  if (nomeUsuario) {
    texto += 'O nome da pessoa que está conversando com você é ' + nomeUsuario + '.\n\n';
  }
  if (estado.aguardandoConfirmacao) {
    texto += 'ATENÇÃO - ESTADO ATUAL: na sua última resposta, você JÁ propôs abrir um chamado para o problema resumido como: "' + (estado.resumoProblema || '') + '". Agora você precisa interpretar a resposta atual da pessoa a essa pergunta: se ela confirmar (sim, pode, claro, etc.), marque confirmar_abertura=true. Se ela recusar (não, deixa, não precisa, etc.), marque cancelar_chamado=true. Se a resposta for ambígua ou for outra coisa, não marque nenhuma das duas e responda pedindo para confirmar com sim ou não.\n\n';
  }
  texto += 'Você deve responder SEMPRE em formato JSON estruturado conforme o schema definido, preenchendo o campo "resposta" com o texto que será enviado à pessoa no chat (sem markdown, texto simples).\n';
  return texto;
}

/**
 * Consulta o Gemini com fallback de modelo: tenta o modelo principal e, em caso
 * de falha (ex.: 503 sobrecarga, 429 limite), passa para o modelo reserva.
 */
function consultarGemini(contents, estado, nomeUsuario) {
  var props = PropertiesService.getScriptProperties();
  var apiKey = props.getProperty('GEMINI_API_KEY');
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY nao configurada nas Propriedades do Script.');
  }
  var modeloPrincipal = props.getProperty('GEMINI_MODEL') || 'gemini-flash-latest';
  var modelosParaTentar = [modeloPrincipal, 'gemini-flash-lite-latest'];

  var schema = {
    type: 'OBJECT',
    properties: {
      resposta: { type: 'STRING' },
      propor_chamado: { type: 'BOOLEAN' },
      confirmar_abertura: { type: 'BOOLEAN' },
      cancelar_chamado: { type: 'BOOLEAN' },
      categoria: { type: 'STRING', enum: ['senha', 'impressora', 'rede', 'academico', 'outro'] },
      resumo: { type: 'STRING' }
    },
    required: ['resposta', 'propor_chamado', 'confirmar_abertura', 'cancelar_chamado', 'categoria', 'resumo']
  };

  var payload = {
    systemInstruction: { parts: [{ text: montarSystemInstruction(estado, nomeUsuario) }] },
    contents: contents,
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: schema,
      temperature: 0.4,
      maxOutputTokens: 600
    }
  };

  // Uma tentativa por modelo: o Google Chat espera a resposta por ~30 s.
  var maxTentativasPorModelo = 1;
  var codigo, corpo;
  var sucesso = false;
  var ultimoErro = null;

  for (var m = 0; m < modelosParaTentar.length && !sucesso; m++) {
    var modelo = modelosParaTentar[m];
    var url = 'https://generativelanguage.googleapis.com/v1beta/models/' + modelo + ':generateContent?key=' + apiKey;

    for (var tentativa = 1; tentativa <= maxTentativasPorModelo; tentativa++) {
      var resposta = UrlFetchApp.fetch(url, {
        method: 'post',
        contentType: 'application/json',
        payload: JSON.stringify(payload),
        muteHttpExceptions: true
      });

      codigo = resposta.getResponseCode();
      corpo = resposta.getContentText();

      if (codigo >= 200 && codigo < 300) {
        sucesso = true;
        break;
      }

      var transitorio = (codigo === 503 || codigo === 429);
      ultimoErro = 'Gemini API (' + modelo + ') retornou ' + codigo + ': ' + corpo;

      if (transitorio && tentativa < maxTentativasPorModelo) {
        console.log('AVISO consultarGemini: modelo ' + modelo + ' tentativa ' + tentativa + ' falhou com ' + codigo + ', tentando novamente...');
        Utilities.sleep(500 * tentativa);
        continue;
      }

      if (transitorio) {
        console.log('AVISO consultarGemini: modelo ' + modelo + ' esgotou tentativas, tentando proximo modelo se houver...');
      }
    }
  }

  if (!sucesso) {
    throw new Error(ultimoErro || 'Gemini API falhou em todos os modelos tentados.');
  }

  var dados = JSON.parse(corpo);
  var textoResposta = dados.candidates && dados.candidates[0] && dados.candidates[0].content && dados.candidates[0].content.parts && dados.candidates[0].content.parts[0] ? dados.candidates[0].content.parts[0].text : null;
  if (!textoResposta) {
    throw new Error('Resposta da Gemini sem conteudo: ' + corpo);
  }
  return JSON.parse(textoResposta);
}
