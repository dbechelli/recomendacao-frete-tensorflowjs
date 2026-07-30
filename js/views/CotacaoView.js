// CotacaoView.js — manipula o DOM (status, log de treino e tabela de cotação).

export class CotacaoView {
  constructor() {
    this.status = document.querySelector('#status');
    this.log = document.querySelector('#log');
    this.avaliacaoEl = document.querySelector('#avaliacao');
    this.rotaInfoEl = document.querySelector('#rota-info');
    this.tbody = document.querySelector('#tabela tbody');
    this.form = document.querySelector('#form-cotacao');
    this._maeTreino = [];
    this._maeValidacao = [];
  }

  setStatus(texto) {
    this.status.textContent = texto;
  }

  // yStd: desvio padrão do alvo (FeatureEngineering.yStd) — usado só para
  // converter o MAE normalizado (z-score) em dias reais no gráfico. Como a
  // normalização é um z-score (afim), erro_normalizado = erro_real / yStd,
  // então MAE_real = MAE_normalizado * yStd (exato, não é aproximação).
  logEpoca(epoch, logs, yStd) {
    this.log.textContent = `época ${epoch} — loss ${logs.loss.toFixed(4)} | val_loss ${(
      logs.val_loss ?? 0
    ).toFixed(4)} | MAE(norm) ${(logs.mae ?? 0).toFixed(4)}`;

    if (!window.tfvis) return;
    this._maeTreino.push({ x: epoch, y: (logs.mae ?? 0) * yStd });
    this._maeValidacao.push({ x: epoch, y: (logs.val_mae ?? 0) * yStd });
    window.tfvis.render.linechart(
      { name: 'MAE por época (dias reais)', tab: 'Treinamento' },
      { values: [this._maeTreino, this._maeValidacao], series: ['treino', 'validação'] },
      { xLabel: 'Época', yLabel: 'MAE (dias)', height: 300 }
    );
  }

  // cep_origem/cep_destino ainda não são resolvidos aqui (isso entra na
  // integração ponta a ponta) — por enquanto só lê os campos do formulário.
  lerRemessa() {
    const f = this.form;
    return {
      cep_origem: f.cep_origem.value,
      cep_destino: f.cep_destino.value,
      zona_rural: Number(f.zona_rural.value),
      tipo_carga: f.tipo_carga.value,
      peso_kg: Number(f.peso.value),
      volume_m3: Number(f.volume.value),
    };
  }

  habilitarFormulario(ok) {
    this.form.querySelector('button').disabled = !ok;
  }

  // avaliacao: { n, maeModelo, maeBaseline, melhoriaPct } — ver AvaliacaoService.js.
  renderAvaliacao(avaliacao) {
    if (!this.avaliacaoEl) return;
    const melhorQueBaseline = avaliacao.melhoriaPct > 0;
    const classe = melhorQueBaseline ? 'ok' : 'alerta';
    const texto = melhorQueBaseline
      ? `${avaliacao.melhoriaPct}% menor erro que a tabela estática`
      : `${Math.abs(avaliacao.melhoriaPct)}% maior erro que a tabela estática`;
    this.avaliacaoEl.innerHTML = `
      <h2>Avaliação do modelo</h2>
      <p class="sub">Medida em ${avaliacao.n} entregas de teste — nunca vistas pelo modelo durante o treino.</p>
      <div class="metricas">
        <div class="metrica"><span class="rotulo">MAE do modelo (IA)</span><strong>${avaliacao.maeModelo}d</strong></div>
        <div class="metrica"><span class="rotulo">MAE da tabela estática</span><strong>${avaliacao.maeBaseline}d</strong></div>
        <div class="metrica"><span class="rotulo">Diferença</span><strong class="${classe}">${texto}</strong></div>
      </div>`;
  }

  // Só o fato cru (a única coisa real no projeto até agora é a distância entre
  // os CEPs, via Google). Nada de explicação aqui — o aviso de "o que é real
  // vs. simulado" é fixo na página (index.html) e o COMO cada número foi
  // calculado fica no "Ver como foi calculado" de cada linha da tabela.
  renderRotaInfo({ distanciaKm, duracaoMinutos }) {
    if (!this.rotaInfoEl) return;
    const horas = Math.floor(duracaoMinutos / 60);
    const minutos = duracaoMinutos % 60;
    this.rotaInfoEl.innerHTML = `Distância real consultada (Google Maps): <strong>${distanciaKm} km</strong> (${horas}h${String(minutos).padStart(2, '0')} de viagem contínua)`;
  }

  static MESES = ['', 'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  static DIAS_SEMANA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

  // c.explicacao vem de RecommendationService.cotar() — os ingredientes crus
  // de cada conta (nada é recalculado aqui, só formatado em texto).
  // entradasModelo = o registro EXATO que foi pra model.preverDias() — mostrar
  // isso é a prova de que o ETA não é chute: é a saída de uma rede neural
  // real, alimentada com esses números específicos.
  _historiaDaLinha(c) {
    const ex = c.explicacao;
    const em = ex.entradasModelo;
    const diasDoca =
      ex.tipoCarga === 'lotacao' ? +(ex.diasConsolidacaoBase * 0.2).toFixed(2) : ex.diasConsolidacaoBase;
    const prazoBaseCalc = (ex.distanciaKm / ex.velocidadeKmDia + diasDoca).toFixed(2);
    const taxaPontualPct = (ex.taxaPontual * 100).toFixed(0);
    const riscoPct = (c.riscoAtraso * 100).toFixed(0);
    const mes = CotacaoView.MESES[em.mes_envio] ?? em.mes_envio;
    const dia = CotacaoView.DIAS_SEMANA[em.dia_semana_envio] ?? em.dia_semana_envio;

    return `
      <p><strong>Prazo tabela (simulado)</strong> — não é dado de nenhuma transportadora real:
      ${ex.distanciaKm}km (real, Google Maps) ÷ ${ex.velocidadeKmDia}km/dia (velocidade rodoviária
      simulada da ${c.transportadora}) + ${diasDoca}d de doca/consolidação (carga ${ex.tipoCarga})
      = ${prazoBaseCalc}d → arredondado para <strong>${c.prazoTabela}d</strong>.</p>

      <p><strong>ETA previsto (IA)</strong> — saída real de uma rede neural (TensorFlow.js),
      alimentada exatamente com estes valores para esta linha:</p>
      <ul class="entradas">
        <li>transportadora: ${em.id_transportadora} · região: ${em.regiao_destino}</li>
        <li>distância: ${em.distancia_km}km (real) · peso: ${em.peso_kg}kg · volume: ${em.volume_m3}m³</li>
        <li>zona rural: ${em.zona_rural ? 'sim' : 'não'} · carga: ${em.tipo_carga} · preço tabela: R$ ${em.preco_frete.toFixed(2)}</li>
        <li>prazo tabela (entrada do modelo): ${em.prazo_tabela_dias}d · mês: ${mes} · dia da semana: ${dia}</li>
      </ul>
      <p>A rede processou esses números (embeddings de transportadora/região + camadas densas) e
      devolveu <strong>${c.etaPrevisto}d</strong> (${c.atrasoPrevistoDias >= 0 ? '+' : ''}${c.atrasoPrevistoDias}d
      vs. o prazo tabela).${
        ex.maeModelo != null
          ? ` Prova de que não é chute: essa mesma rede, testada em entregas que <strong>nunca viu no
      treino</strong>, errou em média apenas <strong>${ex.maeModelo}d</strong> (ver "Avaliação do
      modelo" no topo da página).`
          : ''
      }</p>

      <p><strong>Risco de atraso</strong> — estatística sobre o histórico (sintético): de
      ${c.amostras} entregas da ${c.transportadora} na região ${ex.regiaoDestino}, ${taxaPontualPct}%
      chegaram dentro do prazo tabela da época → risco de atraso = <strong>${riscoPct}%</strong>.
      Incerteza (desvio do erro histórico): ±${c.incertezaDias}d.</p>`;
  }

  renderCotacao(candidatos) {
    this.tbody.innerHTML = candidatos
      .map((c) => {
        const risco = (c.riscoAtraso * 100).toFixed(0);
        const classe = c.recomendada ? 'recomendada' : '';
        const badge = c.recomendada ? '<span class="badge">Indicada pela IA</span>' : '';
        const atraso =
          c.atrasoPrevistoDias > 0
            ? `<span class="alerta">+${c.atrasoPrevistoDias}d</span>`
            : `<span class="ok">${c.atrasoPrevistoDias}d</span>`;
        return `
          <tr class="${classe}">
            <td>${c.transportadora} ${badge}</td>
            <td>R$ ${c.precoTabela.toFixed(2)}</td>
            <td>${c.prazoTabela}d</td>
            <td><strong>${c.etaPrevisto}d</strong> ${atraso}</td>
            <td>${risco}% <small>(${c.rotulo})</small></td>
            <td>±${c.incertezaDias}d <small>${c.amostras} amostras</small></td>
          </tr>
          <tr class="${classe}">
            <td colspan="6" style="padding:0;">
              <details>
                <summary>Ver como foi calculado</summary>
                <div class="historia">${this._historiaDaLinha(c)}</div>
              </details>
            </td>
          </tr>`;
      })
      .join('');
  }
}
