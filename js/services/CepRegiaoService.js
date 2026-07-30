// CepRegiaoService.js
// Deriva a UF e a região (macrorregião do IBGE) a partir de um CEP brasileiro,
// usando as faixas oficiais de CEP por estado dos Correios. Puro, sem API — roda
// igual no navegador e no Node.
//
// Usamos as faixas por UF (não só o 1º dígito do CEP) porque um único dígito
// não separa direito Nordeste de Norte: CEPs que começam com "6" cobrem tanto
// CE/PI/MA (Nordeste) quanto PA/AM/AC/RR/AP/RO (Norte); "7" mistura DF/GO/MT/MS
// (Centro-Oeste) com TO (Norte). As faixas abaixo resolvem isso corretamente.

const FAIXAS_UF = [
  [1000, 19999, 'SP'],
  [20000, 28999, 'RJ'],
  [29000, 29999, 'ES'],
  [30000, 39999, 'MG'],
  [40000, 48999, 'BA'],
  [49000, 49999, 'SE'],
  [50000, 56999, 'PE'],
  [57000, 57999, 'AL'],
  [58000, 58999, 'PB'],
  [59000, 59999, 'RN'],
  [60000, 63999, 'CE'],
  [64000, 64999, 'PI'],
  [65000, 65999, 'MA'],
  [66000, 68899, 'PA'],
  [68900, 68999, 'AP'],
  [69000, 69299, 'AM'],
  [69300, 69399, 'RR'],
  [69400, 69899, 'AM'],
  [69900, 69999, 'AC'],
  [70000, 72799, 'DF'],
  [72800, 72999, 'GO'],
  [73000, 73699, 'DF'],
  [73700, 76799, 'GO'],
  [76800, 76999, 'RO'],
  [77000, 77999, 'TO'],
  [78000, 78899, 'MT'],
  [79000, 79999, 'MS'],
  [80000, 87999, 'PR'],
  [88000, 89999, 'SC'],
  [90000, 99999, 'RS'],
];

// Regiões IBGE — os mesmos rótulos usados por FeatureEngineering/RecommendationService.
const REGIAO_POR_UF = {
  AC: 'Norte', AP: 'Norte', AM: 'Norte', PA: 'Norte', RO: 'Norte', RR: 'Norte', TO: 'Norte',
  AL: 'Nordeste', BA: 'Nordeste', CE: 'Nordeste', MA: 'Nordeste', PB: 'Nordeste',
  PE: 'Nordeste', PI: 'Nordeste', RN: 'Nordeste', SE: 'Nordeste',
  DF: 'Centro-Oeste', GO: 'Centro-Oeste', MT: 'Centro-Oeste', MS: 'Centro-Oeste',
  ES: 'Sudeste', MG: 'Sudeste', RJ: 'Sudeste', SP: 'Sudeste',
  PR: 'Sul', RS: 'Sul', SC: 'Sul',
};

function prefixoNumerico(cep) {
  const digitos = String(cep).replace(/\D/g, '');
  if (digitos.length < 5) return null;
  return Number(digitos.slice(0, 5));
}

export function ufDoCep(cep) {
  const prefixo = prefixoNumerico(cep);
  if (prefixo === null) return null;
  const faixa = FAIXAS_UF.find(([min, max]) => prefixo >= min && prefixo <= max);
  return faixa ? faixa[2] : null;
}

export function regiaoDoCep(cep) {
  const uf = ufDoCep(cep);
  return uf ? REGIAO_POR_UF[uf] : null;
}
