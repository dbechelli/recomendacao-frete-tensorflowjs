// gerar-dados-sinteticos.mjs
// Gera um histórico de entregas realista para treinar o modelo SEM precisar do banco.
// Uso:  node extract/gerar-dados-sinteticos.mjs [qtdRegistros]
// Saída: data/historico.json
//
// A geração em si (perfil das transportadoras, prazo base por velocidade
// rodoviária + consolidação, penalidades de região/sazonalidade/zona rural)
// vive em js/services/FreightModel.js — é a MESMA lógica usada pelo fallback
// no navegador (DataService.js) e pela simulação de cotação ao vivo
// (RecommendationService.js), para não haver três réguas diferentes.

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gerarRegistroSintetico } from '../js/services/FreightModel.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, '../data/historico.json');

const qtd = Number(process.argv[2]) || 3000;
const dados = Array.from({ length: qtd }, gerarRegistroSintetico);

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(dados, null, 2), 'utf8');
console.log(`OK: ${qtd} registros escritos em ${OUT}`);
