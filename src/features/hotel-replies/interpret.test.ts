import { describe, expect, it, vi } from "vitest";
import type { DadosReservaParaIA } from "@/lib/openai/client";

const RESERVA: DadosReservaParaIA = {
  hotel: "Hotel Fictício Praia Azul",
  localizador: "9QGJZN",
  hospedes: "Hóspede Fictício Um, Hóspede Fictício Dois",
  dataCheckin: "10/12/2026",
  dataCheckout: "15/12/2026",
  regimeAlimentar: "Café da manhã",
  fornecedor: "Fornecedor Fictício Turismo",
};

describe("interpretarResposta (orquestração: automática -> regex -> IA, PRD §12.5 nunca chama API real em teste)", () => {
  it("mensagem automática (out-of-office) nunca chega a chamar a IA", async () => {
    vi.resetModules();
    const interpretarRespostaIAMock = vi.fn();
    vi.doMock("@/lib/openai/client", async () => {
      const real = await vi.importActual<typeof import("@/lib/openai/client")>("@/lib/openai/client");
      return { ...real, interpretarRespostaIA: interpretarRespostaIAMock };
    });

    const { interpretarResposta } = await import("./interpret");
    const resultado = await interpretarResposta(
      {
        assunto: "Out of Office",
        remetente: "reservas@hotel.test",
        cabecalhoAutoSubmitted: null,
        cabecalhoPrecedence: null,
        corpoHtmlOuPreview: "<p>Estou fora do escritório.</p>",
      },
      RESERVA
    );

    expect(interpretarRespostaIAMock).not.toHaveBeenCalled();
    expect(resultado.analise._metodoInterpretacao).toBe("AUTOMATICA");
    expect(resultado.statusInterpretacao).toBe("REVISAR");
    vi.doUnmock("@/lib/openai/client");
  });

  it("resposta em formato estruturado é resolvida via regex, sem chamar a IA", async () => {
    vi.resetModules();
    const interpretarRespostaIAMock = vi.fn();
    vi.doMock("@/lib/openai/client", async () => {
      const real = await vi.importActual<typeof import("@/lib/openai/client")>("@/lib/openai/client");
      return { ...real, interpretarRespostaIA: interpretarRespostaIAMock };
    });

    const { interpretarResposta } = await import("./interpret");
    const resultado = await interpretarResposta(
      {
        assunto: "Re: Reconfirmação 9QGJZN",
        remetente: "reservas@hotel.test",
        cabecalhoAutoSubmitted: null,
        cabecalhoPrecedence: null,
        corpoHtmlOuPreview: "<p>Reserva confirmada: SIM</p><p>Numero de confirmacao: HCN-555</p><p>Pagamento: Pago</p>",
      },
      RESERVA
    );

    expect(interpretarRespostaIAMock).not.toHaveBeenCalled();
    expect(resultado.analise._metodoInterpretacao).toBe("REGEX");
    expect(resultado.analise.numero_confirmacao_hotel).toBe("HCN-555");
    vi.doUnmock("@/lib/openai/client");
  });

  it("resposta em texto livre recorre à IA (mockada) e aplica pós-processamento", async () => {
    vi.resetModules();
    const interpretarRespostaIAMock = vi.fn().mockResolvedValue({
      analise: {
        reserva_confirmada: "SIM",
        regime_alimentar_confirmado: "SIM",
        numero_confirmacao_hotel: null,
        confirmacoes_multiplas: [],
        status_pagamento: "PAGO",
        correspondencia_reserva: "CONFIRMADA",
        divergencias: [],
        evidencias_confirmacao: ["Reserva confirmada em texto corrido."],
        tipo_pendencia: "NENHUMA",
        pendencia: null,
        resumo_resposta: "Reserva confirmada pelo hotel.",
        confianca: 0.92,
      },
      consumo: { inputTokens: 500, outputTokens: 120, totalTokens: 620, custoUsd: 0.000073 },
    });
    vi.doMock("@/lib/openai/client", async () => {
      const real = await vi.importActual<typeof import("@/lib/openai/client")>("@/lib/openai/client");
      return { ...real, interpretarRespostaIA: interpretarRespostaIAMock };
    });

    const { interpretarResposta } = await import("./interpret");
    const resultado = await interpretarResposta(
      {
        assunto: "Re: Reconfirmação 9QGJZN",
        remetente: "reservas@hotel.test",
        cabecalhoAutoSubmitted: null,
        cabecalhoPrecedence: null,
        corpoHtmlOuPreview: "<p>Confirmamos a reserva com HCN interno: 778899.</p><p>Café da manhã incluso.</p>",
      },
      RESERVA
    );

    expect(interpretarRespostaIAMock).toHaveBeenCalledTimes(1);
    expect(resultado.analise._metodoInterpretacao).toBe("OPENAI");
    // fallback regex de número de confirmação deve ter preenchido o campo que a IA deixou vazio
    expect(resultado.analise.numero_confirmacao_hotel).toBe("778899");
    expect(resultado.statusInterpretacao).toBe("OK");
    vi.doUnmock("@/lib/openai/client");
  });
});
