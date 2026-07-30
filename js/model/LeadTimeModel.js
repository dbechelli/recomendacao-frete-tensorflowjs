// LeadTimeModel.js
// Rede de regressão com EMBEDDINGS para variáveis categóricas + camadas densas (relu).
// Saída: lead time real previsto (normalizado). A incerteza/confiabilidade é
// calculada estatisticamente no RecommendationService (evolução p/ cabeça
// probabilística fica para a "parte 2" do exercício).

export class LeadTimeModel {
  constructor(features) {
    this.features = features; // instância de FeatureEngineering (já com fit)
    this.model = null;
  }

  construir() {
    const tf = window.tf;
    // +1: índice 0 é reservado para categoria desconhecida (ver FeatureEngineering).
    const nTransp = this.features.vocabTransp.size + 1;
    const nRegiao = this.features.vocabRegiao.size + 1;
    const nNum = this.features.numNumeric;

    const inTransp = tf.input({ shape: [1], dtype: 'int32', name: 'transp' });
    const inRegiao = tf.input({ shape: [1], dtype: 'int32', name: 'regiao' });
    const inNum = tf.input({ shape: [nNum], name: 'num' });

    // Dimensão do embedding ~ raiz do nº de categorias (regra prática).
    const dimT = Math.max(2, Math.ceil(Math.sqrt(nTransp)));
    const dimR = Math.max(2, Math.ceil(Math.sqrt(nRegiao)));

    const embT = tf.layers
      .embedding({ inputDim: nTransp, outputDim: dimT, name: 'emb_transp' })
      .apply(inTransp);
    const embR = tf.layers
      .embedding({ inputDim: nRegiao, outputDim: dimR, name: 'emb_regiao' })
      .apply(inRegiao);

    const flatT = tf.layers.flatten().apply(embT);
    const flatR = tf.layers.flatten().apply(embR);

    let x = tf.layers.concatenate().apply([flatT, flatR, inNum]);
    x = tf.layers.dense({ units: 32, activation: 'relu' }).apply(x);
    x = tf.layers.dropout({ rate: 0.1 }).apply(x);
    x = tf.layers.dense({ units: 16, activation: 'relu' }).apply(x);
    const out = tf.layers.dense({ units: 1, activation: 'linear', name: 'leadTime' }).apply(x);

    this.model = tf.model({ inputs: [inTransp, inRegiao, inNum], outputs: out });
    this.model.compile({
      optimizer: tf.train.adam(0.01),
      loss: 'meanSquaredError',
      metrics: ['mae'],
    });
    return this.model;
  }

  async treinar(dados, { epochs = 30, batchSize = 64, onEpoch } = {}) {
    const { xTransp, xRegiao, xNum } = this.features.transformarEntradas(dados);
    const y = this.features.transformarAlvo(dados);
    const hist = await this.model.fit([xTransp, xRegiao, xNum], y, {
      epochs,
      batchSize,
      validationSplit: 0.15,
      shuffle: true,
      callbacks: {
        onEpochEnd: (epoch, logs) => onEpoch && onEpoch(epoch + 1, logs),
      },
    });
    window.tf.dispose([xTransp, xRegiao, xNum, y]);
    return hist;
  }

  // Prevê lead time (em DIAS reais) para um lote de registros.
  preverDias(dados) {
    const tf = window.tf;
    const { xTransp, xRegiao, xNum } = this.features.transformarEntradas(dados);
    const predNorm = this.model.predict([xTransp, xRegiao, xNum]);
    const arr = predNorm.dataSync();
    tf.dispose([xTransp, xRegiao, xNum, predNorm]);
    return Array.from(arr, (v) => +this.features.desnormalizarAlvo(v).toFixed(1));
  }
}
