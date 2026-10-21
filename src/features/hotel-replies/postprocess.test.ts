import { describe, expect, it } from "vitest";
import { aplicarFallbackExtracao, corrigirDivergenciaDeIdentificadores, mapearConfirmacaoCorreta } from "./postprocess";
import type { InterpretacaoResposta } from "@/lib/openai/schema";

function analiseBase(overrides: Partial<InterpretacaoResposta> = {}): InterpretacaoResposta {
  return {
    reserva_confirmada: "SIM",
    regime_alimentar_confirmado: "SIM",
    numero_confirmacao_hotel: null,
    confirmacoes_multiplas: [],
    status_pagamento: "PAGO",
    correspondencia_reserva: "CONFIRMADA",
    divergencias: [],
    evidencias_confirmacao: [],
    tipo_pendencia: "NENHUMA",
    pendencia: null,
    resumo_resposta: "Reserva confirmada.",
    confianca: 0.9,
    ...overrides,
  };
}

describe("aplicarFallbackExtracao", () => {
  it("preenche numero_confirmacao_hotel via regex quando a IA não extraiu nada", () => {
    const analise = analiseBase({ numero_confirmacao_hotel: null });
    const resultado = aplicarFallbackExtracao(analise, "Confirmamos sob o HCN interno: 55443322");
    expect(resultado.numero_confirmacao_hotel).toBe("55443322");
    expect(resultado.confirmacoes_multiplas).toEqual([{ hospede: "NAO_INFORMADO", numero_confirmacao: "55443322" }]);
  });

  it("não sobrescreve quando a IA já extraiu um número", () => {
    const analise = analiseBase({ numero_confirmacao_hotel: "JA-EXTRAIDO" });
    const resultado = aplicarFallbackExtracao(analise, "HCN interno: 55443322");
    expect(resultado.numero_confirmacao_hotel).toBe("JA-EXTRAIDO");
  });

  it("não aplica fallback quando já há confirmações múltiplas", () => {
    const analise = analiseBase({
      numero_confirmacao_hotel: null,
      confirmacoes_multiplas: [{ hospede: "João", numero_confirmacao: "111" }],
    });
    const resultado = aplicarFallbackExtracao(analise, "HCN interno: 55443322");
    expect(resultado.numero_confirmacao_hotel).toBeNull();
  });
});

describe("corrigirDivergenciaDeIdentificadores", () => {
  it("remove divergência que só compara localizador interno com número de confirmação (falso-positivo)", () => {
    const analise = analiseBase({
      reserva_confirmada: "SIM",
      correspondencia_reserva: "DIVERGENTE",
      tipo_pendencia: "DIVERGENCIA",
      divergencias: ["O localizador informado não corresponde ao número de confirmação recebido (HCN-999)."],
      resumo_resposta: "Reserva confirmada pelo hotel. Divergência entre localizador informado e confirmação recebida (HCN-999).",
    });
    const resultado = corrigirDivergenciaDeIdentificadores(analise);

    expect(resultado.divergencias).toEqual([]);
    expect(resultado.correspondencia_reserva).toBe("PROVAVEL");
    expect(resultado.tipo_pendencia).toBe("NENHUMA");
    expect(resultado.pendencia).toBeNull();
    // Nota: produz ".." (ponto duplicado) — comportamento idêntico ao regex
    // original de respostas.py (`_corrigir_divergencia_de_identificadores`),
    // confirmado reproduzindo a mesma regex em Python. Não corrigido aqui
    // para preservar o comportamento já calibrado em produção (CLAUDE.md).
    expect(resultado.resumo_resposta).toBe("Reserva confirmada pelo hotel..");
  });

  it("preserva divergência real (datas diferentes), não é falso-positivo de identificador", () => {
    const analise = analiseBase({
      reserva_confirmada: "SIM",
      correspondencia_reserva: "DIVERGENTE",
      divergencias: ["Data de check-in informada pelo hotel é diferente da reserva."],
    });
    const resultado = corrigirDivergenciaDeIdentificadores(analise);
    expect(resultado.divergencias).toHaveLength(1);
    expect(resultado.correspondencia_reserva).toBe("DIVERGENTE");
  });

  it("não altera nada quando reserva_confirmada não é SIM", () => {
    const analise = analiseBase({ reserva_confirmada: "NAO", divergencias: ["Qualquer coisa"] });
    const resultado = corrigirDivergenciaDeIdentificadores(analise);
    expect(resultado.divergencias).toEqual(["Qualquer coisa"]);
  });
});

describe("mapearConfirmacaoCorreta", () => {
  it("retorna o número já definido quando não há confirmações múltiplas", () => {
    const analise = analiseBase({ numero_confirmacao_hotel: "ABC", confirmacoes_multiplas: [] });
    expect(mapearConfirmacaoCorreta(analise, "João Silva")).toBe("ABC");
  });

  it("mapeia por nome de hóspede quando há múltiplas confirmações", () => {
    const analise = analiseBase({
      numero_confirmacao_hotel: "MULTIPLAS_CONFIRMACOES",
      confirmacoes_multiplas: [
        { hospede: "João Silva", numero_confirmacao: "111" },
        { hospede: "Maria Souza", numero_confirmacao: "222" },
      ],
    });
    expect(mapearConfirmacaoCorreta(analise, "Maria Souza")).toBe("222");
  });

  it("retorna MULTIPLAS_CONFIRMACOES quando não consegue mapear nenhum hóspede", () => {
    const analise = analiseBase({
      numero_confirmacao_hotel: "MULTIPLAS_CONFIRMACOES",
      confirmacoes_multiplas: [
        { hospede: "João Silva", numero_confirmacao: "111" },
        { hospede: "Maria Souza", numero_confirmacao: "222" },
      ],
    });
    expect(mapearConfirmacaoCorreta(analise, "Pedro Santos")).toBe("MULTIPLAS_CONFIRMACOES");
  });

  it("retorna o único número quando há só 1 confirmação múltipla e nenhum hóspede informado na reserva", () => {
    const analise = analiseBase({
      numero_confirmacao_hotel: null,
      confirmacoes_multiplas: [{ hospede: "NAO_INFORMADO", numero_confirmacao: "999" }],
    });
    expect(mapearConfirmacaoCorreta(analise, "")).toBe("999");
  });
});
