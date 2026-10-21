// Pós-processamento da interpretação (regex ou IA) — portado de
// respostas.py (`_aplicar_fallback_extracao`, `_corrigir_divergencia_de_identificadores`,
// `_mapear_confirmacao_correta`).

import type { InterpretacaoResposta } from "@/lib/openai/schema";
import { extrairNumeroConfirmacaoFallback } from "./regex-fallback";
import { limparTexto } from "./text";

function normalizarSemAcentos(valor: string): string {
  return valor.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Se a IA não extraiu nenhum número, tenta o fallback regex antes de desistir. */
export function aplicarFallbackExtracao(analise: InterpretacaoResposta, corpo: string): InterpretacaoResposta {
  const temConfirmacoesMultiplas = analise.confirmacoes_multiplas.length > 0;
  if (analise.numero_confirmacao_hotel || temConfirmacoesMultiplas) {
    return analise;
  }

  const numeroFallback = extrairNumeroConfirmacaoFallback(corpo);
  if (!numeroFallback) return analise;

  return {
    ...analise,
    numero_confirmacao_hotel: numeroFallback,
    confirmacoes_multiplas: [{ hospede: "NAO_INFORMADO", numero_confirmacao: numeroFallback }],
  };
}

/** Não trata a confirmação do hotel como se fosse o localizador interno. */
export function corrigirDivergenciaDeIdentificadores(analise: InterpretacaoResposta): InterpretacaoResposta {
  if (analise.reserva_confirmada !== "SIM") return analise;

  const divergenciasReais = analise.divergencias.filter((divergencia) => {
    const texto = normalizarSemAcentos(limparTexto(divergencia)).toLowerCase();
    const mencionaIdentificadores = texto.includes("localizador") && (texto.includes("confirmacao") || texto.includes("reserva") || texto.includes("numero"));
    const ehApenasComparacao = ["nao corresponde", "diferente", "diverg"].some((termo) => texto.includes(termo));
    return !(mencionaIdentificadores && ehApenasComparacao);
  });

  const resultado = { ...analise, divergencias: divergenciasReais };

  if (divergenciasReais.length === 0 && resultado.correspondencia_reserva === "DIVERGENTE") {
    resultado.correspondencia_reserva = "PROVAVEL";
  }
  if (divergenciasReais.length === 0 && resultado.tipo_pendencia === "DIVERGENCIA") {
    resultado.tipo_pendencia = "NENHUMA";
    resultado.pendencia = null;
    resultado.resumo_resposta = limparTexto(resultado.resumo_resposta).replace(
      /\s*Divergência entre localizador informado .*? confirmação recebida \([^)]*\)\.?$/i,
      "."
    );
  }

  return resultado;
}

/** Identifica o número de confirmação correto para a reserva consultada, mapeando por nome de hóspede. */
export function mapearConfirmacaoCorreta(analise: InterpretacaoResposta, hospedesReserva: string): string | null {
  const confirmacoesMultiplas = analise.confirmacoes_multiplas;
  const numeroAtual = analise.numero_confirmacao_hotel;

  if (confirmacoesMultiplas.length === 0) return numeroAtual;
  if (numeroAtual && numeroAtual !== "MULTIPLAS_CONFIRMACOES") return numeroAtual;

  const hospedesReservaLower = limparTexto(hospedesReserva).toLowerCase();
  if (!hospedesReservaLower) {
    return confirmacoesMultiplas.length === 1 ? confirmacoesMultiplas[0].numero_confirmacao : "MULTIPLAS_CONFIRMACOES";
  }

  const palavrasReserva = new Set(hospedesReservaLower.split(/\s+/));
  for (const confirmacao of confirmacoesMultiplas) {
    const hospedeResposta = limparTexto(confirmacao.hospede).toLowerCase();
    if (!hospedeResposta) continue;
    const palavrasResposta = new Set(hospedeResposta.split(/\s+/));
    const temIntersecao = [...palavrasResposta].some((palavra) => palavrasReserva.has(palavra));
    if (temIntersecao) return confirmacao.numero_confirmacao;
  }

  return confirmacoesMultiplas.length === 1 ? confirmacoesMultiplas[0].numero_confirmacao : "MULTIPLAS_CONFIRMACOES";
}
