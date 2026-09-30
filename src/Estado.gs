/**
 * Memória da conversa por usuário, guardada no CacheService do Apps Script.
 *
 * Estado: { historico, aguardandoConfirmacao, categoriaProposta, resumoProblema, ultimaInteracao }
 */

function lerEstado(id) {
  var cache = CacheService.getScriptCache();
  var bruto = cache.get('estado_' + id);
  if (!bruto) return { historico: [], aguardandoConfirmacao: false, categoriaProposta: null, resumoProblema: '', ultimaInteracao: null };
  var estado = JSON.parse(bruto);
  if (!estado.historico) estado.historico = [];
  return estado;
}

function salvarEstado(id, estado) {
  var cache = CacheService.getScriptCache();
  estado.ultimaInteracao = Date.now();
  if (estado.historico && estado.historico.length > MAX_HISTORICO) {
    estado.historico = estado.historico.slice(estado.historico.length - MAX_HISTORICO);
  }
  cache.put('estado_' + id, JSON.stringify(estado), 21600); // 6 h, máximo do CacheService
}

function limparEstado(id) {
  CacheService.getScriptCache().remove('estado_' + id);
}
