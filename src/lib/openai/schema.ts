// JSON Schema estrito de interpretação de resposta de hotel — portado de
// `SCHEMA_INTERPRETACAO` em respostas.py quase 1:1 (CLAUDE.md: não reescrever
// o prompt/schema nesta etapa). Mantém os mesmos nomes de campo em português
// e os mesmos valores de enum do sistema de referência.

export const SCHEMA_INTERPRETACAO = {
  type: "object",
  properties: {
    reserva_confirmada: {
      type: "string",
      enum: ["SIM", "NAO", "INDEFINIDO"],
    },
    regime_alimentar_confirmado: {
      type: "string",
      enum: ["SIM", "NAO", "INDEFINIDO"],
    },
    numero_confirmacao_hotel: { type: ["string", "null"] },
    confirmacoes_multiplas: {
      type: "array",
      items: {
        type: "object",
        properties: {
          hospede: { type: "string" },
          numero_confirmacao: { type: "string" },
        },
        required: ["hospede", "numero_confirmacao"],
        additionalProperties: false,
      },
    },
    status_pagamento: {
      type: "string",
      enum: ["PAGO", "PENDENTE", "PAGAMENTO_NO_CHECKIN", "NAO_INFORMADO", "OUTRO"],
    },
    correspondencia_reserva: {
      type: "string",
      enum: ["CONFIRMADA", "PROVAVEL", "DIVERGENTE", "NAO_VERIFICAVEL"],
    },
    divergencias: {
      type: "array",
      items: { type: "string" },
    },
    evidencias_confirmacao: {
      type: "array",
      items: { type: "string" },
    },
    tipo_pendencia: {
      type: "string",
      enum: ["NENHUMA", "OPERACIONAL", "PAGAMENTO", "DIVERGENCIA", "INFORMACAO_INCOMPLETA", "OUTRA"],
    },
    pendencia: { type: ["string", "null"] },
    resumo_resposta: { type: "string" },
    confianca: { type: "number", minimum: 0, maximum: 1 },
  },
  required: [
    "reserva_confirmada",
    "regime_alimentar_confirmado",
    "numero_confirmacao_hotel",
    "confirmacoes_multiplas",
    "status_pagamento",
    "correspondencia_reserva",
    "divergencias",
    "evidencias_confirmacao",
    "tipo_pendencia",
    "pendencia",
    "resumo_resposta",
    "confianca",
  ],
  additionalProperties: false,
} as const;

export type ReservaConfirmada = "SIM" | "NAO" | "INDEFINIDO";
export type StatusPagamento = "PAGO" | "PENDENTE" | "PAGAMENTO_NO_CHECKIN" | "NAO_INFORMADO" | "OUTRO";
export type CorrespondenciaReserva = "CONFIRMADA" | "PROVAVEL" | "DIVERGENTE" | "NAO_VERIFICAVEL";
export type TipoPendencia =
  | "NENHUMA"
  | "OPERACIONAL"
  | "PAGAMENTO"
  | "DIVERGENCIA"
  | "INFORMACAO_INCOMPLETA"
  | "OUTRA";

export type ConfirmacaoMultipla = {
  hospede: string;
  numero_confirmacao: string;
};

export type InterpretacaoResposta = {
  reserva_confirmada: ReservaConfirmada;
  regime_alimentar_confirmado: ReservaConfirmada;
  numero_confirmacao_hotel: string | null;
  confirmacoes_multiplas: ConfirmacaoMultipla[];
  status_pagamento: StatusPagamento;
  correspondencia_reserva: CorrespondenciaReserva;
  divergencias: string[];
  evidencias_confirmacao: string[];
  tipo_pendencia: TipoPendencia;
  pendencia: string | null;
  resumo_resposta: string;
  confianca: number;
};
