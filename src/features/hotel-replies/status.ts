// Status de auditoria da interpretação — portado de respostas.py
// (`determinar_status_interpretacao`, `_tem_pendencia_resposta`,
// `analise_mensagem_automatica`). CONFIRMADA exige regime alimentar
// confirmado, mesmos critérios de negócio já calibrados em produção.

import type { InterpretacaoResposta } from "@/lib/openai/schema";
import { CONSUMO_VAZIO } from "@/lib/openai/client";
import { limparTexto } from "./text";
import type { InterpretacaoComMetadados } from "./regex-fallback";

export function temPendenciaResposta(analise: InterpretacaoResposta): boolean {
  if (analise.tipo_pendencia && analise.tipo_pendencia !== "NENHUMA") return true;
  if (analise.status_pagamento === "PENDENTE") return true;

  const pendencia = limparTexto(analise.pendencia);
  const frasesSemPendencia = new Set(["nenhuma", "nenhuma pendencia", "sem pendencia", "sem pendencias"]);
  if (pendencia && !frasesSemPendencia.has(pendencia.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase())) {
    return true;
  }

  return analise.divergencias.some((item) => limparTexto(item).length > 0);
}

export type StatusInterpretacao = "OK" | "REVISAR";

/** Decide se a interpretação pode ser aceita direto (OK) ou precisa de revisão humana (REVISAR). */
export function determinarStatusInterpretacao(analise: InterpretacaoComMetadados): StatusInterpretacao {
  if (analise._metodoInterpretacao === "AUTOMATICA") return "REVISAR";
  if (temPendenciaResposta(analise)) return "REVISAR";
  if (analise.regime_alimentar_confirmado !== "SIM") return "REVISAR";
  if (analise.correspondencia_reserva === "DIVERGENTE") return "REVISAR";
  if (analise.reserva_confirmada === "INDEFINIDO") return "REVISAR";
  if (analise.correspondencia_reserva === "NAO_VERIFICAVEL" && analise.reserva_confirmada !== "SIM") return "REVISAR";
  if (analise.confianca < 0.45) return "REVISAR";
  return "OK";
}

/** Interpretação padrão para mensagem automática (out-of-office/bounce) — nunca chama IA. */
export function analiseMensagemAutomatica(): InterpretacaoComMetadados {
  return {
    reserva_confirmada: "INDEFINIDO",
    regime_alimentar_confirmado: "INDEFINIDO",
    numero_confirmacao_hotel: null,
    confirmacoes_multiplas: [],
    status_pagamento: "NAO_INFORMADO",
    correspondencia_reserva: "NAO_VERIFICAVEL",
    divergencias: [],
    evidencias_confirmacao: [],
    tipo_pendencia: "INFORMACAO_INCOMPLETA",
    pendencia: "Mensagem automática; confirmação não determinada.",
    resumo_resposta: "Mensagem automática recebida; é necessária revisão manual.",
    confianca: 0,
    _metodoInterpretacao: "AUTOMATICA",
    _consumo: CONSUMO_VAZIO,
  };
}
