// Acúmulo de estado ao longo de tréplicas — portado de respostas.py
// (`_mesclar_estado_acumulado`, `determinar_status_auditoria`).
//
// Cada resposta é interpretada isoladamente, então uma tréplica que só fala
// do regime alimentar não deve apagar o HCN e o status de pagamento já
// confirmados numa mensagem anterior. Para os campos abaixo, mantemos o
// último valor não neutro visto na conversa.

import type { Database } from "@/lib/supabase/types";
import { booleanoParaSimNao } from "./mapping";

type HotelReplyRow = Database["reconfirmacao"]["Tables"]["hotel_replies"]["Row"];

export type EstadoConversa = {
  reservaConfirmada: "SIM" | "NAO" | "INDEFINIDO";
  regimeAlimentarConfirmado: "SIM" | "NAO" | "INDEFINIDO";
  numeroConfirmacaoHotel: string;
  statusPagamento: string;
  correspondenciaReserva: string;
};

/**
 * Mescla os fatos confirmados ao longo de toda a conversa com o hotel.
 * `respostasOrdenadas` deve vir ordenado por `recebido_em` ascendente — a
 * resposta mais recente de cada campo vence, exceto `correspondenciaReserva`,
 * que uma vez DIVERGENTE permanece DIVERGENTE (sinal de alerta não deve ser
 * apagado por uma tréplica ambígua).
 */
export function mesclarEstadoAcumulado(respostasOrdenadas: HotelReplyRow[]): EstadoConversa {
  const estado: EstadoConversa = {
    reservaConfirmada: "INDEFINIDO",
    regimeAlimentarConfirmado: "INDEFINIDO",
    numeroConfirmacaoHotel: "",
    statusPagamento: "NAO_INFORMADO",
    correspondenciaReserva: "NAO_VERIFICAVEL",
  };

  for (const resposta of respostasOrdenadas) {
    const reservaConfirmada = booleanoParaSimNao(resposta.reserva_confirmada);
    if (reservaConfirmada !== "INDEFINIDO") estado.reservaConfirmada = reservaConfirmada;

    const regimeConfirmado = booleanoParaSimNao(resposta.regime_alimentar_confirmado);
    if (regimeConfirmado !== "INDEFINIDO") estado.regimeAlimentarConfirmado = regimeConfirmado;

    const numeros = Array.isArray(resposta.numeros_confirmacao) ? resposta.numeros_confirmacao : [];
    if (numeros.length > 0) {
      const primeiro = numeros[0] as { numero_confirmacao?: string } | undefined;
      if (primeiro?.numero_confirmacao) estado.numeroConfirmacaoHotel = primeiro.numero_confirmacao;
    }

    const statusPagamento = (resposta.status_pagamento ?? "").toUpperCase();
    if (statusPagamento && statusPagamento !== "NAO_INFORMADO") estado.statusPagamento = statusPagamento;

    // correspondencia_reserva não é persistida como coluna própria — reservado
    // para quando a interpretação completa (não só os campos booleanos) for
    // mantida em memória durante o processamento de uma conversa (Milestone 10).
  }

  return estado;
}

export type StatusAuditoria =
  | "AGUARDANDO_RESPOSTA"
  | "ERRO_NO_ENVIO"
  | "RESPONDIDO_AO_HOTEL"
  | "CONFIRMADA"
  | "NAO_CONFIRMADA"
  | "REVISAR"
  | "REVISAR_DIVERGENCIA";

/**
 * Status final de auditoria de uma reserva — portado de
 * `determinar_status_auditoria`. Opera sobre o estado acumulado da conversa
 * (não só a última resposta isolada).
 */
export function determinarStatusAuditoria(params: {
  statusUltimoEnvio: Database["reconfirmacao"]["Enums"]["email_send_status"] | null;
  temResposta: boolean;
  estado: EstadoConversa;
  temPendencia: boolean;
}): StatusAuditoria {
  if (params.statusUltimoEnvio === "erro") return "ERRO_NO_ENVIO";
  if (!params.temResposta) return "AGUARDANDO_RESPOSTA";

  if (params.temPendencia) return "REVISAR";
  if (params.estado.regimeAlimentarConfirmado !== "SIM") return "REVISAR";
  if (params.estado.correspondenciaReserva === "DIVERGENTE") return "REVISAR_DIVERGENCIA";
  if (params.estado.reservaConfirmada === "SIM") return "CONFIRMADA";
  if (params.estado.reservaConfirmada === "NAO") return "NAO_CONFIRMADA";
  return "REVISAR";
}
