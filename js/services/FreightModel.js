// FreightModel.js
// Fonte única de verdade do cenário sintético de frete: perfil das
// transportadoras, geração de registro de histórico e cálculo do prazo de
// tabela. Usado por extract/gerar-dados-sinteticos.mjs (Node, gera
// data/historico.json), js/services/DataService.js (fallback no navegador) e
// js/services/RecommendationService.js (simula preço/prazo numa cotação ao
// vivo) — os três precisam do MESMO cálculo, senão o modelo treina com uma
// régua e cota com outra.
//
// Prazo de tabela = velocidade média rodoviária (km/dia, considerando
// paradas obrigatórias de descanso do motorista — não é a velocidade de
// dirigir sem parar) + dias de consolidação em terminal (cross-docking de
// carga fracionada; carga em lotação praticamente não passa por isso, por
// isso usa só 20% do valor). Isso ancora o prazo previsto em algo real: dá
// pra comparar com o tempo de viagem puro que o Google Maps retorna
// (GeocodingService) e a diferença faz sentido (viagem + parada + doca).

export const REGIOES = ['Sudeste', 'Sul', 'Centro-Oeste', 'Nordeste', 'Norte'];

// velocidadeKmDia: km/dia efetivos de progresso em transporte rodoviário de
// longa distância no Brasil (~400-600 km/dia é a faixa usual considerando
// jornada legal de descanso do motorista — não confundir com velocidade de
// cruzeiro). diasConsolidacao: dias de doca/cross-docking típicos de frete
// fracionado (coleta + consolidação na origem, desconsolidação no destino).
export const TRANSPORTADORAS = [
  { nome: 'TransRápido',   precoBase: 120, velocidadeKmDia: 550, diasConsolidacao: 1.0, forte: 'Sudeste',      fraca: 'Nordeste', ruralPenalidade: 2.5, variabilidade: 1.8 },
  { nome: 'LogSegura',     precoBase: 145, velocidadeKmDia: 450, diasConsolidacao: 1.5, forte: 'Sul',          fraca: 'Norte',    ruralPenalidade: 0.8, variabilidade: 0.6 },
  { nome: 'ExpressoBR',    precoBase: 110, velocidadeKmDia: 500, diasConsolidacao: 0.8, forte: 'Centro-Oeste', fraca: 'Sudeste',  ruralPenalidade: 2.0, variabilidade: 1.4 },
  { nome: 'NacionalCargo', precoBase: 160, velocidadeKmDia: 480, diasConsolidacao: 1.3, forte: 'Nordeste',     fraca: 'Sul',      ruralPenalidade: 1.0, variabilidade: 0.9 },
];

const rand = (min, max) => Math.random() * (max - min) + min;
const randInt = (min, max) => Math.floor(rand(min, max + 1));
const pick = (arr) => arr[randInt(0, arr.length - 1)];

// Fator sazonal: novembro (Black Friday) e dezembro (Natal) atrasam mais.
export function fatorSazonal(mes) {
  if (mes === 11) return 1.6;
  if (mes === 12) return 1.9;
  if (mes === 1) return 1.2;
  return 1.0;
}

function diasDeConsolidacao(transportadora, tipoCarga) {
  // Carga em lotação (FTL) não passa por consolidação em terminal como a
  // fracionada (LTL) — é um caminhão dedicado, direto — por isso só 20% do
  // diasConsolidacao normal.
  return tipoCarga === 'lotacao' ? transportadora.diasConsolidacao * 0.2 : transportadora.diasConsolidacao;
}

// Prazo base (dias): o compromisso comercial "de tabela" da transportadora —
// fixo, baseado no perfil dela (velocidade média + doca), não no trajeto
// específico de uma cotação. É a MESMA fórmula usada pra gerar os dados de
// treino (gerar-dados-sinteticos.mjs / DataService.js) e pra simular a
// cotação ao vivo (RecommendationService) — precisa ser sempre a mesma régua.
// O valor analítico do projeto não está em recalcular esse prazo a partir do
// Google; está em prever o risco real de estourá-lo (ETA previsto / risco de
// atraso, aprendidos do histórico).
export function calcularPrazoBase(transportadora, distanciaKm, tipoCarga) {
  return distanciaKm / transportadora.velocidadeKmDia + diasDeConsolidacao(transportadora, tipoCarga);
}

export function gerarRegistroSintetico() {
  const t = pick(TRANSPORTADORAS);
  const regiaoDestino = pick(REGIOES);
  const distanciaKm = Math.round(rand(80, 3200));
  const zonaRural = Math.random() < 0.3 ? 1 : 0;
  const tipoCarga = Math.random() < 0.6 ? 'fracionada' : 'lotacao';
  const pesoKg = tipoCarga === 'lotacao' ? Math.round(rand(2000, 12000)) : Math.round(rand(5, 800));
  const volumeM3 = +(pesoKg / rand(180, 320)).toFixed(2);
  const mes = randInt(1, 12);
  const diaSemana = randInt(0, 6); // 0=domingo ... 6=sábado

  const precoFrete = +(t.precoBase + distanciaKm * 0.04 + pesoKg * 0.015 + rand(-10, 10)).toFixed(2);

  const prazoBase = calcularPrazoBase(t, distanciaKm, tipoCarga);
  const prazoTabelaDias = Math.max(1, Math.round(prazoBase));

  // LEAD TIME REAL (alvo): prazo base + penalidades ocultas + ruído. O modelo
  // deve aprender essas penalidades a partir dos dados — nunca são expostas
  // como feature.
  let real = prazoBase;
  if (regiaoDestino === t.fraca) real *= 1.5;
  if (regiaoDestino === t.forte) real *= 0.85;
  real *= fatorSazonal(mes);
  if (zonaRural) real += t.ruralPenalidade;
  if (diaSemana === 5) real += 1.2 * zonaRural; // sexta + zona rural: penalidade extra
  real += rand(-1, 1) * t.variabilidade; // ruído específico da transportadora
  const leadTimeRealDias = +Math.max(1, real).toFixed(1);

  return {
    id_transportadora: t.nome,
    cep_origem: '01001-000',
    cep_destino: `${randInt(10000, 89999)}-000`,
    regiao_destino: regiaoDestino,
    zona_rural: zonaRural,
    tipo_carga: tipoCarga,
    distancia_km: distanciaKm,
    peso_kg: pesoKg,
    volume_m3: volumeM3,
    preco_frete: precoFrete,
    prazo_tabela_dias: prazoTabelaDias,
    dia_semana_envio: diaSemana,
    mes_envio: mes,
    lead_time_real_dias: leadTimeRealDias,
  };
}
