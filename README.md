# Recomendação de Frete por Confiabilidade (ETA real) - TensorFlow.js

Protótipo educacional (Exercício 01 da Pós - Engenharia de IA). Adaptação do
exemplo de aula `exemplo-01-ecommerce-recomendations-z` (Erick Wendel) para o
domínio de **frete/logística**.

Em vez de recomendar o frete só pelo **preço/prazo da tabela**, o app treina uma
rede neural (TensorFlow.js, **direto no navegador**) que prevê o **lead time real
(ETA)** e o **risco de atraso** de cada transportadora - recomendando por
**custo x tempo x confiabilidade**, não só pelo menor preço.

## O que é real e o que é simulado

- **Real**: a distância e o tempo de viagem entre os dois CEPs informados (Google
  Maps Distance Matrix API).
- **Simulado**: transportadoras, preços, prazos de tabela e o histórico de
  entregas usado para treinar o modelo. É um cenário sintético com penalidades de
  atraso conhecidas (região, sazonalidade, zona rural) - o objetivo é a rede
  neural **aprender esses padrões sozinha**, a partir dos dados, sem que eles
  sejam informados como regra.

Cada linha da tabela de cotação tem um "Ver como foi calculado" que mostra a
conta exata (e os valores exatos enviados para a rede neural) por trás de cada
número.

## Como rodar

```bash
npm install

# 1) Gere o histórico sintético (opcional: o app também gera no navegador se faltar)
npm run gerar-dados

# 2) Configure a chave da Google Maps API (necessária pra resolver CEP -> distância)
cp js/config.example.js js/config.js
# edite js/config.js e cole sua chave

# 3) Suba o app
npm start
# abre http://localhost:3000
```

### Chave da Google Maps API

O formulário de cotação usa CEP de origem/destino, resolvidos via **Google Maps
JavaScript API** (`DistanceMatrixService`). Para funcionar, você precisa de uma
chave própria:

1. Crie um projeto no [Google Cloud Console](https://console.cloud.google.com/)
   e habilite a **Distance Matrix API**.
2. Crie uma chave de API e **restrinja por referrer HTTP** (ex.: `localhost:3000/*`)
   para não deixá-la aberta.
3. Cole a chave em `js/config.js` (gitignorado - nunca é versionado):

   ```js
   window.GOOGLE_MAPS_API_KEY = 'sua-chave-aqui';
   ```

Sem chave configurada, a cotação por CEP falha com uma mensagem de erro clara na
tela (não quebra silenciosamente).

## Uso

O modelo treina ao abrir a página - acompanhe o status, o log de épocas e o
painel do `tfjs-vis` com o gráfico de MAE (abre sozinho no canto da tela).
Depois, preencha CEP origem/destino, peso, volume e tipo de carga, e clique em
**Cotar**. Marque "cliente exige pontualidade" para ver a recomendação priorizar
confiabilidade em vez de preço.

## Estrutura

```text
index.html                          UI + carrega TensorFlow.js/tfjs-vis via CDN
package.json                        browser-sync (dev server) + scripts
js/config.example.js                modelo da chave da Google Maps API
data/historico.json                 histórico de entregas sintético (gerado)
extract/
  gerar-dados-sinteticos.mjs        gera histórico sintético (sem banco)
js/
  main.js                           orquestra: dados -> split treino/teste -> features -> treino -> avaliação -> cotação
  services/DataService.js           carrega o histórico (fallback sintético no navegador)
  services/FreightModel.js          fonte única do cenário sintético (perfil das transportadoras, geração de dados)
  services/FeatureEngineering.js    embeddings (índices) + normalização + sazonalidade
  services/AvaliacaoService.js      split treino/teste + MAE do modelo vs baseline
  services/GeocodingService.js      CEP -> distância/tempo real (Google Maps)
  services/CepRegiaoService.js      CEP -> região (IBGE), por faixa oficial dos Correios
  model/LeadTimeModel.js            rede: embeddings + densas (relu) -> ETA previsto
  services/RecommendationService.js ETA + confiabilidade histórica -> recomendação
  views/CotacaoView.js              renderiza avaliação do modelo + tabela custo x confiança
```

## Modelo (resumo)

- **Entradas categóricas** (`id_transportadora`, `regiao_destino`) → *embeddings*.
  É assim que o modelo aprende que "a Transportadora A é ótima no Sudeste, mas falha no Nordeste".
- **Entradas numéricas**: distância, peso, volume, preço, prazo de tabela, zona rural,
  tipo de carga, e sazonalidade (mês e dia da semana em seno/cosseno).
- **Saída**: lead time real previsto (dias).
- **Confiabilidade/incerteza**: calculada estatisticamente por transportadora+região
  (taxa de pontualidade e desvio do erro histórico). Uma cabeça probabilística na
  própria rede é a evolução natural para uma próxima versão.

## Avaliação (treino x teste)

Antes de qualquer ajuste, o histórico é separado em **80% treino / 20% teste**
(`js/services/AvaliacaoService.js`). O vocabulário, a normalização e os pesos do
modelo são calculados **só** com o conjunto de treino; o conjunto de teste nunca é
visto pelo modelo até a avaliação final.

Depois do treino, o app mostra na tela (seção "Avaliação do modelo"):

- **MAE do modelo** - erro médio absoluto (em dias reais) nas entregas de teste.
- **MAE da tabela estática** - mesmo cálculo usando `prazo_tabela_dias` como
  previsão ingênua, para comparação.
- **Diferença** - quanto o modelo reduz o erro em relação à tabela estática.

Isso evidencia se o modelo generalizou (aprendeu o padrão oculto do histórico) em
vez de só decorar o treino.

## Limitações desta versão

- Cenário 100% sintético - transportadoras, preços e prazos de tabela não
  correspondem a nenhuma empresa real.
- Sem persistência do modelo treinado (retreina do zero a cada load de página).
- Sem testes automatizados formais (há scripts de verificação usados durante o
  desenvolvimento, não integrados a uma suíte).
