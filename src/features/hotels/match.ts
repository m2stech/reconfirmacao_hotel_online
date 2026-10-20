// Matching fuzzy de nome de hotel para ligar reserva importada ao banco de
// contatos (Milestone 5). Matching mais sofisticado (Tavily, correção de
// grafia assistida por IA) fica para o Milestone 8 — aqui é só normalização +
// distância de edição, suficiente para pegar variações de acentuação/sufixo
// ("Hotel Fictício Praia Azul" vs "HOTEL FICTICIO PRAIA AZUL LTDA").

export type HotelParaMatch = {
  id: string;
  nome: string;
  nomesAlternativos: string[];
};

export type ResultadoMatch = {
  hotelId: string | null;
  confianca: number; // 0 a 1
};

const SUFIXOS_EMPRESARIAIS = /\b(ltda|s\/a|sa|eireli|me|epp|hotel|resort|inn|hostel)\b/g;

function normalizar(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // remove acentos
    .toLowerCase()
    .replace(SUFIXOS_EMPRESARIAIS, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Distância de Levenshtein clássica — nomes de hotel são curtos (poucas
// dezenas de caracteres), então O(n*m) não é um problema de performance aqui.
function distanciaLevenshtein(a: string, b: string): number {
  const linhas = a.length + 1;
  const colunas = b.length + 1;
  const matriz: number[][] = Array.from({ length: linhas }, () => new Array(colunas).fill(0));

  for (let i = 0; i < linhas; i++) matriz[i][0] = i;
  for (let j = 0; j < colunas; j++) matriz[0][j] = j;

  for (let i = 1; i < linhas; i++) {
    for (let j = 1; j < colunas; j++) {
      const custo = a[i - 1] === b[j - 1] ? 0 : 1;
      matriz[i][j] = Math.min(
        matriz[i - 1][j] + 1,
        matriz[i][j - 1] + 1,
        matriz[i - 1][j - 1] + custo
      );
    }
  }

  return matriz[linhas - 1][colunas - 1];
}

function similaridade(a: string, b: string): number {
  if (a === b) return 1;
  const maior = Math.max(a.length, b.length);
  if (maior === 0) return 1;
  return 1 - distanciaLevenshtein(a, b) / maior;
}

const LIMIAR_MATCH_AUTOMATICO = 0.86;

/**
 * Compara o nome de hotel vindo do RoomingList contra o banco de contatos
 * (nome principal + nomes alternativos de cada hotel) e retorna o melhor
 * match acima do limiar de confiança automática.
 */
export function encontrarMelhorMatch(
  nomeImportado: string,
  hoteis: HotelParaMatch[]
): ResultadoMatch {
  const alvo = normalizar(nomeImportado);
  if (!alvo) return { hotelId: null, confianca: 0 };

  let melhor: ResultadoMatch = { hotelId: null, confianca: 0 };

  for (const hotel of hoteis) {
    const candidatos = [hotel.nome, ...hotel.nomesAlternativos].map(normalizar);
    for (const candidato of candidatos) {
      if (!candidato) continue;
      const score = candidato === alvo ? 1 : similaridade(alvo, candidato);
      if (score > melhor.confianca) {
        melhor = { hotelId: hotel.id, confianca: score };
      }
    }
  }

  if (melhor.confianca < LIMIAR_MATCH_AUTOMATICO) {
    return { hotelId: null, confianca: melhor.confianca };
  }
  return melhor;
}
