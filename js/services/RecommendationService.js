// RecommendationService.js
// Junta a PREVISÃO do modelo (ETA real) com a CONFIABILIDADE histórica de cada
// transportadora e devolve uma recomendação custo x confiança para uma cotação.

import { TRANSPORTADORAS, calcularPrazoBase } from './FreightModel.js';

export class RecommendationService {
  constructor(model) {
    this.model = model; // LeadTimeModel treinado
    this.stats = new Map(); // chave "transp|regiao" -> { n, onTime, somaErro, somaErro2 }
    this._validarVocabulario();
  }

  // TRANSPORTADORAS (perfil sintético de preço/prazo) só é válido enquanto o
  // histórico carregado for o mesmo cenário sintético. Ao trocar para dados
  // reais do Postgres, essa lista precisa virar a tabela de preços real do
  // negócio — falhar aqui evita cotar transportadoras que o modelo nunca viu.
  _validarVocabulario() {
    const vocab = this.model.features.vocabTransp;
    const faltando = TRANSPORTADORAS.filter((t) => !vocab.has(t.nome));
    if (faltando.length > 0) {
      throw new Error(
        `RecommendationService: transportadora(s) ${faltando.map((t) => t.nome).join(', ')} ` +
          'não existe(m) no vocabulário do histórico carregado (fora de fit() do FeatureEngineering). ' +
          'A lista TRANSPORTADORAS (DataService.js) só é válida para o cenário sintético — ' +
          'ao usar dados reais, substitua-a pela tabela de preços real do negócio.'
      );
    }
  }

  // Calcula, do histórico, a taxa de pontualidade e o desvio do erro por
  // transportadora + região (confiabilidade = quão previsível ela é ali).
  ajustarConfiabilidade(dados) {
    for (const r of dados) {
      for (const chave of [`${r.id_transportadora}|${r.regiao_destino}`, `${r.id_transportadora}|*`]) {
        if (!this.stats.has(chave)) this.stats.set(chave, { n: 0, onTime: 0, somaErro: 0, somaErro2: 0 });
        const s = this.stats.get(chave);
        const erro = r.lead_time_real_dias - r.prazo_tabela_dias; // >0 = atrasou
        s.n += 1;
        if (r.lead_time_real_dias <= r.prazo_tabela_dias) s.onTime += 1;
        s.somaErro += erro;
        s.somaErro2 += erro * erro;
      }
    }
    return this;
  }

  _confiabilidade(transp, regiao) {
    const s = this.stats.get(`${transp}|${regiao}`) || this.stats.get(`${transp}|*`);
    if (!s || s.n === 0) return { taxaPontual: 0.5, erroMedio: 0, desvio: 1, amostras: 0 };
    const taxaPontual = s.onTime / s.n;
    const erroMedio = s.somaErro / s.n;
    const desvio = Math.sqrt(Math.max(0, s.somaErro2 / s.n - erroMedio ** 2));
    return { taxaPontual, erroMedio, desvio, amostras: s.n };
  }

  // Simula a "tabela" de cada transportadora para uma remessa (preço e prazo).
  // O "prazo tabela" é o compromisso comercial da transportadora — fixo, dado
  // pelo perfil dela (mesma fórmula usada para gerar os dados de treino, pra
  // nunca cotar numa régua diferente da que o modelo aprendeu). NÃO muda com
  // o tempo de viagem real do Google — o que é analítico/de valor real aqui é
  // o "ETA previsto (IA)" e o "risco de atraso": o quanto o histórico diz que
  // essa transportadora, nessa região, tende a estourar esse prazo fixo.
  _cotarTabela(t, remessa) {
    const preco = +(t.precoBase + remessa.distancia_km * 0.04 + remessa.peso_kg * 0.015).toFixed(2);
    const prazo = Math.max(1, Math.round(calcularPrazoBase(t, remessa.distancia_km, remessa.tipo_carga)));
    return { preco, prazo };
  }

  // remessa: { regiao_destino, zona_rural, tipo_carga, distancia_km, peso_kg, volume_m3, mes_envio, dia_semana_envio }
  // opcoes.exigePontualidade: se true, prioriza menor risco sobre preço.
  cotar(remessa, opcoes = {}) {
    // Monta os registros de todos os candidatos primeiro para prever em UM
    // único forward pass (this.model.preverDias já aceita lote — evita 4
    // alocações/disposals de tensor separados a cada cotação).
    const base = TRANSPORTADORAS.map((t) => {
      const { preco, prazo } = this._cotarTabela(t, remessa);
      const registro = {
        id_transportadora: t.nome,
        regiao_destino: remessa.regiao_destino,
        zona_rural: remessa.zona_rural,
        tipo_carga: remessa.tipo_carga,
        distancia_km: remessa.distancia_km,
        peso_kg: remessa.peso_kg,
        volume_m3: remessa.volume_m3,
        preco_frete: preco,
        prazo_tabela_dias: prazo,
        mes_envio: remessa.mes_envio,
        dia_semana_envio: remessa.dia_semana_envio,
      };
      return { transportadora: t, preco, prazo, registro };
    });

    const etasPrevistos = this.model.preverDias(base.map((b) => b.registro));

    const candidatos = base.map(({ transportadora: t, preco, prazo, registro }, i) => {
      const etaPrevisto = etasPrevistos[i];
      const conf = this._confiabilidade(t.nome, remessa.regiao_destino);
      const riscoAtraso = 1 - conf.taxaPontual; // 0..1
      return {
        transportadora: t.nome,
        precoTabela: preco,
        prazoTabela: prazo,
        etaPrevisto,
        atrasoPrevistoDias: +(etaPrevisto - prazo).toFixed(1),
        riscoAtraso,
        incertezaDias: +conf.desvio.toFixed(1),
        amostras: conf.amostras,
        // Ingredientes crus da conta, só pra explicar a linha na UI (nenhum
        // valor novo é calculado aqui, só exposto pra montar a "história").
        // entradasModelo = o registro EXATO que foi pra model.preverDias()
        // pra essa transportadora — a prova de que o número não é chutado.
        explicacao: {
          distanciaKm: remessa.distancia_km,
          tipoCarga: remessa.tipo_carga,
          regiaoDestino: remessa.regiao_destino,
          velocidadeKmDia: t.velocidadeKmDia,
          diasConsolidacaoBase: t.diasConsolidacao,
          taxaPontual: conf.taxaPontual,
          entradasModelo: registro,
          maeModelo: opcoes.maeModelo ?? null,
        },
      };
    });

    // Score: quanto menor, melhor. Combina preço normalizado e risco.
    const precos = candidatos.map((c) => c.precoTabela);
    const min = Math.min(...precos), max = Math.max(...precos);
    const norm = (p) => (max === min ? 0 : (p - min) / (max - min));
    const wRisco = opcoes.exigePontualidade ? 0.85 : 0.5;
    const wCusto = 1 - wRisco;
    for (const c of candidatos) c.score = wCusto * norm(c.precoTabela) + wRisco * c.riscoAtraso;

    candidatos.sort((a, b) => a.score - b.score);
    candidatos.forEach((c, i) => {
      c.recomendada = i === 0;
      c.rotulo =
        c.riscoAtraso <= 0.15 ? 'Baixo risco' : c.riscoAtraso <= 0.35 ? 'Risco moderado' : 'Alto risco';
    });
    return candidatos;
  }
}
