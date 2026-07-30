// main.js — orquestra: carrega dados -> feature engineering -> treina modelo ->
// habilita a cotação. TensorFlow.js vem via <script> (window.tf) no index.html.

import { DataService } from './services/DataService.js';
import { FeatureEngineering } from './services/FeatureEngineering.js';
import { LeadTimeModel } from './model/LeadTimeModel.js';
import { RecommendationService } from './services/RecommendationService.js';
import { CotacaoView } from './views/CotacaoView.js';
import { splitTreinoTeste, avaliar } from './services/AvaliacaoService.js';
import { GeocodingService } from './services/GeocodingService.js';
import { regiaoDoCep } from './services/CepRegiaoService.js';

async function iniciar() {
  const view = new CotacaoView();
  view.habilitarFormulario(false);
  view.setStatus('Carregando histórico de entregas...');

  const dados = await new DataService().carregar();

  // Separa treino/teste ANTES de qualquer ajuste: o modelo nunca vê o teste,
  // nem para treinar pesos, nem para calcular vocabulário/normalização.
  const { treino, teste } = splitTreinoTeste(dados, 0.8);

  view.setStatus(`Preparando features (${treino.length} registros de treino)...`);
  const features = new FeatureEngineering().fit(treino);

  const modelo = new LeadTimeModel(features);
  modelo.construir();

  view.setStatus('Treinando o modelo no navegador (TensorFlow.js)...');
  await modelo.treinar(treino, {
    epochs: 30,
    onEpoch: (epoch, logs) => view.logEpoca(epoch, logs, features.yStd),
  });

  view.setStatus(`Avaliando em ${teste.length} entregas nunca vistas no treino...`);
  const avaliacao = avaliar(modelo, teste);
  view.renderAvaliacao(avaliacao);

  // Confiabilidade histórica: estatística de negócio usada na recomendação,
  // por isso usa o histórico completo (não é o que está sendo avaliado acima).
  const recomendador = new RecommendationService(modelo).ajustarConfiabilidade(dados);

  view.setStatus('Modelo treinado. Faça uma cotação abaixo.');
  view.habilitarFormulario(true);

  const geocoding = new GeocodingService();

  // Assíncrono: resolve os CEPs (Google Distance Matrix) antes de montar a
  // remessa e cotar. Sem cotação automática no load — cada chamada à API do
  // Google é paga/tem cota, então só dispara quando o usuário pedir.
  view.form.addEventListener('submit', async (e) => {
    e.preventDefault();
    view.habilitarFormulario(false);
    view.setStatus('Consultando distância entre os CEPs (Google Maps)...');
    try {
      const dadosForm = view.lerRemessa();

      const regiao_destino = regiaoDoCep(dadosForm.cep_destino);
      if (!regiao_destino) {
        throw new Error(`CEP de destino inválido: "${dadosForm.cep_destino}"`);
      }

      const { distanciaKm, duracaoMinutos } = await geocoding.buscarDistancia(
        dadosForm.cep_origem,
        dadosForm.cep_destino
      );
      view.renderRotaInfo({ distanciaKm, duracaoMinutos });

      const agora = new Date();
      const remessa = {
        regiao_destino,
        zona_rural: dadosForm.zona_rural,
        tipo_carga: dadosForm.tipo_carga,
        distancia_km: distanciaKm,
        peso_kg: dadosForm.peso_kg,
        volume_m3: dadosForm.volume_m3,
        mes_envio: agora.getMonth() + 1,
        dia_semana_envio: agora.getDay(),
      };

      const exigePontualidade = view.form.pontualidade.checked;
      // maeModelo: passa a métrica já validada em dado de teste (Etapa de
      // avaliação) pra dentro da cotação, pra poder citar como prova de
      // confiabilidade na explicação de cada linha.
      const candidatos = recomendador.cotar(remessa, { exigePontualidade, maeModelo: avaliacao.maeModelo });
      view.renderCotacao(candidatos);
      view.setStatus('Cotação pronta. Ajuste os campos e cote de novo quando quiser.');
    } catch (err) {
      console.error(err);
      view.setStatus('Erro na cotação: ' + err.message);
    } finally {
      view.habilitarFormulario(true);
    }
  });
}

iniciar().catch((err) => {
  console.error(err);
  document.querySelector('#status').textContent = 'Erro: ' + err.message;
});
