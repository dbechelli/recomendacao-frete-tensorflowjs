// GeocodingService.js
// Resolve distância (km) e tempo de viagem entre dois CEPs via a Google Maps
// JavaScript API (google.maps.DistanceMatrixService).
//
// NÃO usamos o endpoint REST clássico
// (maps.googleapis.com/maps/api/distancematrix/json) — é o que o VBA em Excel
// usa via MSXML2.ServerXMLHTTP, funciona de servidor, mas o Google não libera
// CORS nele para chamadas de navegador. A Maps JavaScript API é a via suportada
// pelo Google para isso rodar direto no browser, por isso carregamos o script
// dela sob demanda aqui (em vez de um <script> fixo no index.html).

let carregandoPromise = null;

// Carregamento "clássico" via <script src>, sem loading=async: o navegador
// mostra um aviso de performance no console (inofensivo), mas
// google.maps.DistanceMatrixService fica disponível direto após o onload —
// testado e funcionando. loading=async exigiria google.maps.importLibrary(),
// que não fica disponível carregando o script assim (por tag dinâmica), só
// via o snippet de bootstrap oficial do Google — trocar de abordagem só vale
// a pena se o aviso de console virar um problema real.
function carregarGoogleMaps() {
  if (window.google?.maps?.DistanceMatrixService) return Promise.resolve();
  if (carregandoPromise) return carregandoPromise;

  const key = window.GOOGLE_MAPS_API_KEY;
  if (!key) {
    return Promise.reject(
      new Error(
        'GOOGLE_MAPS_API_KEY não configurada. Copie js/config.example.js para js/config.js e preencha sua chave.'
      )
    );
  }

  carregandoPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}`;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Falha ao carregar a Google Maps JavaScript API.'));
    document.head.appendChild(script);
  });
  return carregandoPromise;
}

// Mesmos casos de falha tratados pelo precedente em VBA (ConsultarDistanciaGoogleKM).
const MENSAGEM_STATUS = {
  NOT_FOUND: 'CEP não encontrado pelo Google Maps.',
  ZERO_RESULTS: 'Não foi encontrada rota entre os dois CEPs.',
  REQUEST_DENIED: 'Chave da Google Maps API inválida ou sem permissão para Distance Matrix.',
  OVER_QUERY_LIMIT: 'Cota da Google Maps API excedida.',
  INVALID_REQUEST: 'CEP inválido.',
};

export class GeocodingService {
  // Retorna { distanciaKm, duracaoMinutos } a partir de dois CEPs (Brasil).
  // Lança Error com mensagem legível em qualquer caso de falha (nunca retorna 0
  // silenciosamente — um distancia_km=0 silencioso contaminaria a cotação).
  async buscarDistancia(cepOrigem, cepDestino) {
    await carregarGoogleMaps();
    const service = new window.google.maps.DistanceMatrixService();

    const resposta = await new Promise((resolve, reject) => {
      service.getDistanceMatrix(
        {
          origins: [`${cepOrigem}, Brasil`],
          destinations: [`${cepDestino}, Brasil`],
          travelMode: window.google.maps.TravelMode.DRIVING,
          unitSystem: window.google.maps.UnitSystem.METRIC,
          language: 'pt-BR',
        },
        (result, status) => {
          if (status !== 'OK') {
            reject(new Error(MENSAGEM_STATUS[status] || `Falha na Distance Matrix API: ${status}`));
            return;
          }
          resolve(result);
        }
      );
    });

    const elemento = resposta.rows?.[0]?.elements?.[0];
    if (!elemento || elemento.status !== 'OK') {
      throw new Error(
        MENSAGEM_STATUS[elemento?.status] ||
          'Não foi possível calcular a distância entre os CEPs informados.'
      );
    }

    return {
      distanciaKm: +(elemento.distance.value / 1000).toFixed(1),
      duracaoMinutos: Math.round(elemento.duration.value / 60),
    };
  }
}
