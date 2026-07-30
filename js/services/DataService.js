// DataService.js
// Carrega o histórico de entregas. Tenta ler data/historico.json (gerado por
// Node, sintético ou vindo do Postgres). Se não existir, gera dados sintéticos
// no próprio navegador para o app nunca quebrar em uma primeira execução —
// usando o MESMO gerador de extract/gerar-dados-sinteticos.mjs (ver
// FreightModel.js), para não haver dois cenários sintéticos divergentes.

import { gerarRegistroSintetico } from './FreightModel.js';

export class DataService {
  async carregar() {
    try {
      const resp = await fetch('data/historico.json', { cache: 'no-store' });
      if (resp.ok) {
        const dados = await resp.json();
        if (Array.isArray(dados) && dados.length > 0) {
          console.log(`DataService: ${dados.length} registros carregados de data/historico.json`);
          return dados;
        }
      }
    } catch (_) {
      /* sem arquivo — cai no fallback */
    }
    console.warn('DataService: data/historico.json ausente. Gerando dados sintéticos no navegador.');
    return Array.from({ length: 3000 }, gerarRegistroSintetico);
  }
}
