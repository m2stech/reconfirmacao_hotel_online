import * as XLSX from "xlsx";

// Cabeçalho do RoomingList está sempre na linha 5 (header=4 no pandas do app
// de referência — enviar_email.py `carregar_reservas`). Linhas 1-4 são
// metadados de impressão (data, "Snow Operadora", título, intervalo de datas).
const HEADER_ROW_INDEX = 4;

const COLUNAS_OBRIGATORIAS = [
  "Hotel",
  "Proveedor",
  "Pasajeros",
  "Localizador",
  "Localizador Externo",
  "Fecha Entrada",
  "Fecha Salida",
  "Tipo Habitación",
  "Reg",
] as const;

export type HospedeConsolidado = {
  nome: string;
};

export type ReservaConsolidada = {
  localizador: string;
  localizadorExterno: string | null;
  hotelNome: string;
  fornecedor: string | null;
  dataCheckin: string | null;
  dataCheckout: string | null;
  tipoHabitacao: string | null;
  regimeAlimentar: string | null;
  hospedes: HospedeConsolidado[];
  linhasOriginais: number;
};

// Preenchido depois do parsing (rota de preview), ao ligar a reserva ao
// banco de contatos de hotéis (Milestone 5) — não faz parte do parsing puro.
export type ReservaConsolidadaComHotel = ReservaConsolidada & {
  hotelId: string | null;
  hotelMatchConfianca: number;
  jaProcessado: boolean;
  jaProcessadoEm: string | null;
};

export type ParseRoomingListResult =
  | { ok: true; reservas: ReservaConsolidada[] }
  | { ok: false; erro: string; colunasFaltantes?: string[]; colunasEncontradas?: string[] };

function limparTexto(valor: unknown): string {
  if (valor === null || valor === undefined) return "";
  return String(valor)
    .replace(/\r?\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Planilha guarda datas como serial Excel (ex. 46251). XLSX expõe o helper
// de conversão para {y,m,d} sem depender de fuso horário.
function formatarDataSerial(valor: unknown): string | null {
  if (valor === null || valor === undefined || valor === "") return null;
  if (typeof valor === "number") {
    const data = XLSX.SSF.parse_date_code(valor);
    if (!data) return null;
    const mm = String(data.m).padStart(2, "0");
    const dd = String(data.d).padStart(2, "0");
    return `${data.y}-${mm}-${dd}`;
  }
  const texto = limparTexto(valor);
  return texto || null;
}

function dividirPassageiros(valor: unknown): string[] {
  const texto = limparTexto(valor);
  if (!texto) return [];
  return texto
    .split(" - ")
    .map((nome) => nome.replace(/\(Tit\.\)\s*$/i, "").trim())
    .filter(Boolean);
}

export function parseRoomingList(buffer: ArrayBuffer | Buffer): ParseRoomingListResult {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: false });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) {
    return { ok: false, erro: "Planilha não tem nenhuma aba." };
  }

  const linhas = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
  const cabecalho = (linhas[HEADER_ROW_INDEX] ?? []).map((coluna) => limparTexto(coluna));

  const colunasFaltantes = COLUNAS_OBRIGATORIAS.filter((coluna) => !cabecalho.includes(coluna));
  if (colunasFaltantes.length > 0) {
    return {
      ok: false,
      erro: "Colunas obrigatórias não encontradas no cabeçalho (linha 5).",
      colunasFaltantes,
      colunasEncontradas: cabecalho.filter(Boolean),
    };
  }

  const indice = (coluna: string) => cabecalho.indexOf(coluna);
  const idx = {
    hotel: indice("Hotel"),
    proveedor: indice("Proveedor"),
    pasajeros: indice("Pasajeros"),
    localizador: indice("Localizador"),
    localizadorExterno: indice("Localizador Externo"),
    fechaEntrada: indice("Fecha Entrada"),
    fechaSalida: indice("Fecha Salida"),
    tipoHabitacion: indice("Tipo Habitación"),
    reg: indice("Reg"),
  };

  const dadosBrutos = linhas.slice(HEADER_ROW_INDEX + 1);

  // Chave de consolidação é (localizador, hotel) — não só localizador: o
  // mesmo Localizador pode cobrir um roteiro multi-destino (ex. D4D138 com
  // 4 hotéis diferentes em 4 cidades para o mesmo casal). Cada hotel só
  // precisa confirmar o trecho dele, então vira uma reserva separada com
  // seu próprio e-mail — mas múltiplas linhas do MESMO hotel sob o mesmo
  // localizador (ex. 9QGJZN, 2 quartos) continuam consolidadas em 1.
  const porLocalizadorEHotel = new Map<string, ReservaConsolidada>();

  for (const linha of dadosBrutos) {
    const localizador = limparTexto(linha[idx.localizador]);
    if (!localizador) continue; // linha vazia de rodapé/espaçamento

    const hotelNome = limparTexto(linha[idx.hotel]);
    const chave = `${localizador}::${hotelNome}`;
    const hospedesDaLinha = dividirPassageiros(linha[idx.pasajeros]).map((nome) => ({ nome }));

    const existente = porLocalizadorEHotel.get(chave);
    if (existente) {
      existente.hospedes.push(...hospedesDaLinha);
      existente.linhasOriginais += 1;
      continue;
    }

    porLocalizadorEHotel.set(chave, {
      localizador,
      localizadorExterno: limparTexto(linha[idx.localizadorExterno]) || null,
      hotelNome,
      fornecedor: limparTexto(linha[idx.proveedor]) || null,
      dataCheckin: formatarDataSerial(linha[idx.fechaEntrada]),
      dataCheckout: formatarDataSerial(linha[idx.fechaSalida]),
      tipoHabitacao: limparTexto(linha[idx.tipoHabitacion]) || null,
      regimeAlimentar: limparTexto(linha[idx.reg]) || null,
      hospedes: hospedesDaLinha,
      linhasOriginais: 1,
    });
  }

  return { ok: true, reservas: Array.from(porLocalizadorEHotel.values()) };
}
