// extrair-do-postgres.mjs
// Conecta no Postgres, roda o SQL de feature engineering e escreve data/historico.json
// no MESMO formato do gerador sintético (o app não sabe a origem dos dados).
//
// Pré-requisitos:
//   npm install pg
//   Definir a connection string em DATABASE_URL, por exemplo:
//   PowerShell:  $env:DATABASE_URL="postgres://user:senha@host:5432/banco"; node extract/extrair-do-postgres.mjs
//
// IMPORTANTE: os nomes de tabela/coluna abaixo são um exemplo genérico.
// Ajuste-os ao schema real do seu banco antes de rodar.

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, '../data/historico.json');

// ---------------------------------------------------------------------------
// Feature engineering direto no SQL. O alvo do modelo é lead_time_real_dias.
// Também trazemos prazo_tabela_dias para comparar previsão x tabela.
// distancia_km: se você não tiver a distância calculada, derive por API de
// geocoding/roteirização e materialize numa coluna. Aqui assumimos que existe.
// ---------------------------------------------------------------------------
const SQL = `
  SELECT
    e.id_transportadora::text                                   AS id_transportadora,
    e.cep_origem                                                AS cep_origem,
    e.cep_destino                                               AS cep_destino,
    e.regiao_destino                                            AS regiao_destino,
    COALESCE(e.zona_rural, 0)                                   AS zona_rural,
    e.tipo_carga                                                AS tipo_carga,
    e.distancia_km                                              AS distancia_km,
    e.peso_kg                                                   AS peso_kg,
    e.volume_m3                                                 AS volume_m3,
    e.preco_frete                                               AS preco_frete,
    e.prazo_tabela_dias                                         AS prazo_tabela_dias,
    EXTRACT(DOW  FROM e.data_envio)::int                        AS dia_semana_envio,
    EXTRACT(MONTH FROM e.data_envio)::int                       AS mes_envio,
    -- ALVO: diferença real em dias entre entrega e envio
    (e.data_entrega_real::date - e.data_envio::date)            AS lead_time_real_dias,
    -- Erro histórico da tabela (para análise, não é feature do modelo)
    (e.data_entrega_real::date - e.data_previsao_tabela::date)  AS erro_previsao_dias
  FROM entregas e
  WHERE e.data_entrega_real IS NOT NULL
    AND e.data_envio IS NOT NULL
    AND e.data_envio >= NOW() - INTERVAL '12 months'
    AND (e.data_entrega_real::date - e.data_envio::date) BETWEEN 0 AND 60  -- descarta outliers/erros
`;

async function main() {
  const { Client } = pg;
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const { rows } = await client.query(SQL);
    // Normaliza tipos numéricos (Postgres devolve alguns como string).
    const dados = rows.map((r) => ({
      ...r,
      zona_rural: Number(r.zona_rural),
      distancia_km: Number(r.distancia_km),
      peso_kg: Number(r.peso_kg),
      volume_m3: Number(r.volume_m3),
      preco_frete: Number(r.preco_frete),
      prazo_tabela_dias: Number(r.prazo_tabela_dias),
      dia_semana_envio: Number(r.dia_semana_envio),
      mes_envio: Number(r.mes_envio),
      lead_time_real_dias: Number(r.lead_time_real_dias),
    }));
    mkdirSync(dirname(OUT), { recursive: true });
    writeFileSync(OUT, JSON.stringify(dados, null, 2), 'utf8');
    console.log(`OK: ${dados.length} registros reais escritos em ${OUT}`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('Falha na extração:', err.message);
  process.exit(1);
});
