// FeatureEngineering.js
// Transforma registros brutos em tensores para o TensorFlow.js.
//  - Categóricas (transportadora, região) -> índices inteiros (viram embeddings no modelo).
//  - Numéricas -> normalizadas (z-score) e sazonalidade em seno/cosseno.
//  - Alvo (lead_time_real_dias) -> normalizado; desnormalizado na hora de prever.

const TAU = Math.PI * 2;

// Índice 0 é reservado para "categoria desconhecida" (fora do vocabulário de
// treino) — assim idxTransp/idxRegiao não aliasa um valor não visto para uma
// categoria real arbitrária (ver LeadTimeModel: inputDim = vocab.size + 1).
function construirVocab(valores) {
  const mapa = new Map();
  for (const v of valores) if (!mapa.has(v)) mapa.set(v, mapa.size + 1);
  return mapa;
}

// Vetor numérico (ordem fixa e documentada) para um registro.
function vetorNumerico(r) {
  const lotacao = r.tipo_carga === 'lotacao' ? 1 : 0;
  return [
    r.distancia_km,
    r.peso_kg,
    r.volume_m3,
    r.preco_frete,
    r.prazo_tabela_dias,
    Number(r.zona_rural) || 0,
    lotacao,
    Math.sin((TAU * r.mes_envio) / 12),
    Math.cos((TAU * r.mes_envio) / 12),
    Math.sin((TAU * r.dia_semana_envio) / 7),
    Math.cos((TAU * r.dia_semana_envio) / 7),
  ];
}

export class FeatureEngineering {
  // Ajusta vocabulários e estatísticas de normalização com os dados de treino.
  fit(dados) {
    this.vocabTransp = construirVocab(dados.map((r) => r.id_transportadora));
    this.vocabRegiao = construirVocab(dados.map((r) => r.regiao_destino));

    const matriz = dados.map(vetorNumerico);
    const n = matriz[0].length;
    this.mean = new Array(n).fill(0);
    this.std = new Array(n).fill(0);
    for (const linha of matriz) for (let j = 0; j < n; j++) this.mean[j] += linha[j];
    this.mean = this.mean.map((s) => s / matriz.length);
    for (const linha of matriz)
      for (let j = 0; j < n; j++) this.std[j] += (linha[j] - this.mean[j]) ** 2;
    this.std = this.std.map((s) => Math.sqrt(s / matriz.length) || 1);

    const alvos = dados.map((r) => r.lead_time_real_dias);
    this.yMean = alvos.reduce((a, b) => a + b, 0) / alvos.length;
    this.yStd =
      Math.sqrt(alvos.reduce((a, b) => a + (b - this.yMean) ** 2, 0) / alvos.length) || 1;
    return this;
  }

  get numNumeric() {
    return this.mean.length;
  }

  idxTransp(nome) {
    return this.vocabTransp.has(nome) ? this.vocabTransp.get(nome) : 0;
  }
  idxRegiao(nome) {
    return this.vocabRegiao.has(nome) ? this.vocabRegiao.get(nome) : 0;
  }

  _normNum(r) {
    const v = vetorNumerico(r);
    return v.map((x, j) => (x - this.mean[j]) / this.std[j]);
  }

  // Converte um lote de registros nos 3 tensores de entrada.
  transformarEntradas(dados) {
    const transp = dados.map((r) => [this.idxTransp(r.id_transportadora)]);
    const regiao = dados.map((r) => [this.idxRegiao(r.regiao_destino)]);
    const num = dados.map((r) => this._normNum(r));
    return {
      xTransp: window.tf.tensor2d(transp, [dados.length, 1], 'int32'),
      xRegiao: window.tf.tensor2d(regiao, [dados.length, 1], 'int32'),
      xNum: window.tf.tensor2d(num, [dados.length, this.numNumeric], 'float32'),
    };
  }

  // Alvo normalizado (float32).
  transformarAlvo(dados) {
    const y = dados.map((r) => [(r.lead_time_real_dias - this.yMean) / this.yStd]);
    return window.tf.tensor2d(y, [dados.length, 1], 'float32');
  }

  desnormalizarAlvo(valorNorm) {
    return valorNorm * this.yStd + this.yMean;
  }
}
