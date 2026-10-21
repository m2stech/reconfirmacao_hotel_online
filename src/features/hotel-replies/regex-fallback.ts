// Fallback regex para respostas em formato estruturado — portado de
// respostas.py (`interpretar_resposta_regex`, `_extrair_campo_estruturado`,
// `_observacao_e_pendencia`, `_extrair_numero_confirmacao_fallback`).
// Ordem de prioridade: regex primeiro, IA só se o regex não reconhecer o
// formato (PRD §12.5 — reduz custo de IA).

import type { InterpretacaoResposta } from "@/lib/openai/schema";
import { CONSUMO_VAZIO, type ConsumoOpenAI } from "@/lib/openai/client";

function normalizarSemAcentos(valor: string): string {
  return valor.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

// Mapeia cada posição do texto normalizado (sem acento) para a posição
// correspondente no texto original, preservando acentos no trecho extraído.
function normalizarComMapa(valor: string): { normalizado: string; mapa: number[] } {
  let normalizado = "";
  const mapa: number[] = [];
  for (let indice = 0; indice < valor.length; indice++) {
    const partes = valor[indice].normalize("NFD");
    for (const parte of partes) {
      if (!/[̀-ͯ]/.test(parte)) {
        normalizado += parte;
        mapa.push(indice);
      }
    }
  }
  return { normalizado, mapa };
}

function extrairCampoEstruturado(corpo: string, rotulo: string, multiline = false): string | null {
  const rotuloNormalizado = normalizarSemAcentos(rotulo);
  const { normalizado: corpoNormalizado, mapa } = normalizarComMapa(corpo);
  const trecho = multiline ? "[\\s\\S]*" : "[^\\r\\n]*";
  const padrao = new RegExp(`^[ \\t]*${rotuloNormalizado}[ \\t]*:[ \\t]*(${trecho})`, "im");
  const correspondencia = padrao.exec(corpoNormalizado);
  if (!correspondencia || correspondencia.index === undefined || correspondencia[1] === undefined) {
    return null;
  }
  const inicioNormalizado = correspondencia.index + correspondencia[0].length - correspondencia[1].length;
  const fimNormalizado = inicioNormalizado + correspondencia[1].length;
  const inicio = mapa[inicioNormalizado] ?? corpo.length;
  const fim = fimNormalizado > inicioNormalizado ? (mapa[fimNormalizado - 1] ?? corpo.length - 1) + 1 : inicio;
  return corpo.slice(inicio, fim).trim();
}

const FRASES_ENCERRAMENTO =
  /^\s*(?:evelyn travassos|obrigada(?:\s*[•·]\s*thanks)?|atenciosamente|atenciosamente,|best regards)\s*$/im;

const FRASES_SEM_PENDENCIA = new Set([
  "sem pendencia",
  "sem pendencias",
  "nenhuma pendencia",
  "nenhuma pendencias",
  "tudo certo",
  "ok",
]);

function observacaoEPendencia(observacao: string): string | null {
  const observacaoLimpa = observacao.trim().split(FRASES_ENCERRAMENTO)[0].trim();
  if (!observacaoLimpa) return null;
  const normalizada = normalizarSemAcentos(observacaoLimpa).toLowerCase();
  if (FRASES_SEM_PENDENCIA.has(normalizada)) return null;
  return observacaoLimpa;
}

export type InterpretacaoComMetadados = InterpretacaoResposta & {
  _metodoInterpretacao: "REGEX" | "OPENAI" | "AUTOMATICA";
  _consumo: ConsumoOpenAI;
};

/**
 * Interpreta corpo de e-mail em formato estruturado ("Reserva confirmada:
 * SIM", "Pagamento: ...", "Observações: ..."). Retorna `null` quando o
 * formato não é reconhecido — nesse caso quem chama deve recorrer à IA.
 */
export function interpretarRespostaRegex(corpo: string): InterpretacaoComMetadados | null {
  const reserva = extrairCampoEstruturado(corpo, "Reserva confirmada");
  const numero = extrairCampoEstruturado(corpo, "Numero de confirmacao");
  const pagamento = extrairCampoEstruturado(corpo, "Pagamento");
  const observacoes = extrairCampoEstruturado(corpo, "Observacoes", true);

  if (reserva === null || pagamento === null) return null;

  const reservaNormalizada = normalizarSemAcentos(reserva).trim().toUpperCase();
  if (["SIM / NAO", "SIM/NAO", "SIM OU NAO"].includes(reservaNormalizada)) return null;
  if (!["SIM", "NAO"].includes(reservaNormalizada)) return null;

  const pagamentoNormalizado = normalizarSemAcentos(pagamento).trim().toUpperCase();
  if (["PAGO / PENDENTE / CHECK-IN", "PAGO/PENDENTE/CHECK-IN"].includes(pagamentoNormalizado)) return null;

  let statusPagamento: InterpretacaoResposta["status_pagamento"];
  if (pagamentoNormalizado === "PAGO") {
    statusPagamento = "PAGO";
  } else if (pagamentoNormalizado === "PENDENTE") {
    statusPagamento = "PENDENTE";
  } else if (["CHECK-IN", "CHECKIN"].includes(pagamentoNormalizado.replace(/\s/g, ""))) {
    statusPagamento = "PAGAMENTO_NO_CHECKIN";
  } else {
    return null;
  }

  let numeroLimpo = numero ? numero.trim() : null;
  if (numeroLimpo && ["-", "--", "n/a", "na", "nao informado"].includes(normalizarSemAcentos(numeroLimpo).toLowerCase())) {
    numeroLimpo = null;
  }

  const pendencia = observacaoEPendencia(observacoes ?? "");
  const reservaConfirmada: InterpretacaoResposta["reserva_confirmada"] = reservaNormalizada === "SIM" ? "SIM" : "NAO";

  let tipoPendencia: InterpretacaoResposta["tipo_pendencia"] = "NENHUMA";
  if (reservaConfirmada === "NAO") {
    tipoPendencia = "OUTRA";
  } else if (statusPagamento === "PENDENTE") {
    tipoPendencia = "PAGAMENTO";
  } else if (pendencia) {
    tipoPendencia = "OPERACIONAL";
  }

  let resumo: string;
  if (reservaConfirmada === "NAO") {
    resumo = "Hotel informou que a reserva não está confirmada.";
  } else if (numeroLimpo) {
    resumo = `Reserva confirmada pelo hotel sob o número ${numeroLimpo}. Pagamento confirmado como ${statusPagamento.toLowerCase()}.`;
  } else {
    resumo = `Reserva confirmada pelo hotel, porém sem número interno de confirmação informado. Pagamento confirmado como ${statusPagamento.toLowerCase()}.`;
  }

  return {
    reserva_confirmada: reservaConfirmada,
    regime_alimentar_confirmado: "INDEFINIDO",
    numero_confirmacao_hotel: numeroLimpo,
    confirmacoes_multiplas: [],
    status_pagamento: statusPagamento,
    correspondencia_reserva: "PROVAVEL",
    divergencias: [],
    evidencias_confirmacao: ["Resposta em formato estruturado informou confirmação da reserva."],
    tipo_pendencia: tipoPendencia,
    pendencia,
    resumo_resposta: resumo,
    confianca: 1,
    _metodoInterpretacao: "REGEX",
    _consumo: CONSUMO_VAZIO,
  };
}

const PADROES_NUMERO_CONFIRMACAO = [
  /(?:hcn|h\.c\.n\.)\s*(?:interno)?\s*:?[ \t]*([A-Z0-9\s\-]+)/i,
  /(?:n[uú]mero\s+de\s+)?confirma[çc][aã]o\s+(?:de\s+reserva\s+)?[eé]?\s*:?\s*([A-Z0-9\s\-]+)/i,
  /(?:reservation|booking|confirmation)\s+(?:number|code|reference)\s+(?:is\s+)?:?\s*([A-Z0-9\s\-]+)/i,
  /localizador(?:es)?\s+interno(?:s)?:?\s*([A-Z0-9\s\-]+)/i,
  /referenc(?:e|ia)\s+(?:number|n[uú]mero)?:?\s*([A-Z0-9\s\-]+)/i,
  /bajo\s+el\s+n[uú]mero:?\s*([A-Z0-9\s\-]+)/i,
];

/** Extrai número de confirmação do texto quando a IA não captura — fallback. */
export function extrairNumeroConfirmacaoFallback(corpo: string): string | null {
  for (const padrao of PADROES_NUMERO_CONFIRMACAO) {
    const correspondencia = padrao.exec(corpo);
    if (correspondencia) {
      const numero = correspondencia[1].trim();
      if (numero.length >= 4 && /\d/.test(numero)) {
        return numero;
      }
    }
  }
  return null;
}
