// AvaliacaoService.js
// Metodologia de treino/teste: separa o histórico ANTES de qualquer ajuste do
// modelo, para que a avaliação final rode sobre entregas que a rede nunca viu
// durante o treino (nem para aprender pesos, nem para calcular vocabulário ou
// normalização). Compara o erro do modelo (MAE em dias reais) contra o baseline
// ingênuo de usar o prazo de tabela como previsão — evidência de que a rede
// aprendeu um padrão real, não só decorou o treino.

function embaralhar(dados) {
  const copia = [...dados];
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}

export function splitTreinoTeste(dados, proporcaoTreino = 0.8) {
  const embaralhado = embaralhar(dados);
  const corte = Math.round(embaralhado.length * proporcaoTreino);
  return { treino: embaralhado.slice(0, corte), teste: embaralhado.slice(corte) };
}

function mae(erros) {
  return erros.reduce((soma, e) => soma + Math.abs(e), 0) / erros.length;
}

// Avalia o modelo já treinado em dadosTeste (nunca vistos no treino) e compara
// com o baseline (prazo_tabela_dias como previsão ingênua do lead time real).
export function avaliar(modelo, dadosTeste) {
  const previstos = modelo.preverDias(dadosTeste);
  const errosModelo = dadosTeste.map((r, i) => previstos[i] - r.lead_time_real_dias);
  const errosBaseline = dadosTeste.map((r) => r.prazo_tabela_dias - r.lead_time_real_dias);

  const maeModelo = mae(errosModelo);
  const maeBaseline = mae(errosBaseline);
  const melhoriaPct = maeBaseline > 0 ? ((maeBaseline - maeModelo) / maeBaseline) * 100 : 0;

  return {
    n: dadosTeste.length,
    maeModelo: +maeModelo.toFixed(2),
    maeBaseline: +maeBaseline.toFixed(2),
    melhoriaPct: +melhoriaPct.toFixed(1),
  };
}
