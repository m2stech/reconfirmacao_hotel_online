import { describe, expect, it } from "vitest";
import { analiseMensagemAutomatica, determinarStatusInterpretacao, temPendenciaResposta } from "./status";
import { CONSUMO_VAZIO } from "@/lib/openai/client";
import type { InterpretacaoComMetadados } from "./regex-fallback";

function analiseBase(overrides: Partial<InterpretacaoComMetadados> = {}): InterpretacaoComMetadados {
  return {
    reserva_confirmada: "SIM",
    regime_alimentar_confirmado: "SIM",
    numero_confirmacao_hotel: "HCN-123",
    confirmacoes_multiplas: [],
    status_pagamento: "PAGO",
    correspondencia_reserva: "CONFIRMADA",
    divergencias: [],
    evidencias_confirmacao: [],
    tipo_pendencia: "NENHUMA",
    pendencia: null,
    resumo_resposta: "Reserva confirmada.",
    confianca: 0.9,
    _metodoInterpretacao: "OPENAI",
    _consumo: CONSUMO_VAZIO,
    ...overrides,
  };
}

describe("temPendenciaResposta", () => {
  it("false quando não há pendência, pagamento ok e sem divergência", () => {
    expect(temPendenciaResposta(analiseBase())).toBe(false);
  });

  it("true quando status_pagamento é PENDENTE", () => {
    expect(temPendenciaResposta(analiseBase({ status_pagamento: "PENDENTE" }))).toBe(true);
  });

  it("true quando tipo_pendencia diferente de NENHUMA", () => {
    expect(temPendenciaResposta(analiseBase({ tipo_pendencia: "OPERACIONAL" }))).toBe(true);
  });

  it("true quando há divergência não vazia", () => {
    expect(temPendenciaResposta(analiseBase({ divergencias: ["Data de check-in diverge"] }))).toBe(true);
  });

  it("false quando pendência é uma frase de 'sem pendência'", () => {
    expect(temPendenciaResposta(analiseBase({ pendencia: "Sem pendência" }))).toBe(false);
  });
});

describe("determinarStatusInterpretacao (CONFIRMADA exige regime alimentar confirmado — PRD)", () => {
  it("OK quando tudo confirmado, sem pendência e confiança alta", () => {
    expect(determinarStatusInterpretacao(analiseBase())).toBe("OK");
  });

  it("REVISAR quando regime alimentar não está confirmado, mesmo com reserva confirmada", () => {
    expect(determinarStatusInterpretacao(analiseBase({ regime_alimentar_confirmado: "INDEFINIDO" }))).toBe("REVISAR");
  });

  it("REVISAR quando há pendência, mesmo com reserva confirmada", () => {
    expect(determinarStatusInterpretacao(analiseBase({ status_pagamento: "PENDENTE" }))).toBe("REVISAR");
  });

  it("REVISAR quando correspondência é DIVERGENTE", () => {
    expect(determinarStatusInterpretacao(analiseBase({ correspondencia_reserva: "DIVERGENTE" }))).toBe("REVISAR");
  });

  it("REVISAR quando reserva_confirmada é INDEFINIDO", () => {
    expect(determinarStatusInterpretacao(analiseBase({ reserva_confirmada: "INDEFINIDO" }))).toBe("REVISAR");
  });

  it("REVISAR quando confiança está abaixo de 0.45", () => {
    expect(determinarStatusInterpretacao(analiseBase({ confianca: 0.2 }))).toBe("REVISAR");
  });

  it("REVISAR sempre para método AUTOMATICA, mesmo que os campos pareçam OK", () => {
    expect(determinarStatusInterpretacao(analiseBase({ _metodoInterpretacao: "AUTOMATICA" }))).toBe("REVISAR");
  });
});

describe("analiseMensagemAutomatica", () => {
  it("gera interpretação neutra exigindo revisão, sem gastar IA", () => {
    const analise = analiseMensagemAutomatica();
    expect(analise._metodoInterpretacao).toBe("AUTOMATICA");
    expect(analise._consumo).toEqual(CONSUMO_VAZIO);
    expect(determinarStatusInterpretacao(analise)).toBe("REVISAR");
  });
});
