import { describe, expect, it, vi } from "vitest";
import type { ReservaPendenteDeResposta } from "./pending";
import type { MensagemGraph } from "@/lib/graph/read-mail";

function pendenteBase(overrides: Partial<ReservaPendenteDeResposta> = {}): ReservaPendenteDeResposta {
  return {
    emailSendId: "send-1",
    reservationId: "reserva-1",
    createdByEnvioOriginal: null,
    envios: [
      {
        destinatario: "reservas@hotel.test",
        conversationId: "conv-1",
        internetMessageId: "<envio@snow.test>",
        graphMessageId: "graph-envio",
        assunto: "Confirmação de reserva",
        localizador: "9QGJZN",
        dataEnvio: "2026-10-01T10:00:00Z",
      },
    ],
    dadosParaIA: {
      hotel: "Hotel Fictício",
      localizador: "9QGJZN",
      hospedes: "Hóspede Um",
      dataCheckin: "10/12/2026",
      dataCheckout: "15/12/2026",
      regimeAlimentar: "Café da manhã",
      fornecedor: "Fornecedor Fictício",
    },
    ...overrides,
  };
}

function mensagemBase(overrides: Partial<MensagemGraph> = {}): MensagemGraph {
  return {
    id: "msg-1",
    conversationId: "conv-1",
    internetMessageId: "<msg-1@hotel.test>",
    subject: "Re: Reconfirmação 9QGJZN",
    receivedDateTime: "2026-10-02T10:00:00Z",
    bodyContent: "<p>Reserva confirmada: SIM</p><p>Numero de confirmacao: HCN-1</p><p>Pagamento: Pago</p>",
    bodyPreview: null,
    remetente: "reservas@hotel.test",
    cabecalhoAutoSubmitted: null,
    cabecalhoPrecedence: null,
    cabecalhoInReplyTo: null,
    cabecalhoReferences: null,
    ...overrides,
  };
}

async function montarAmbiente(options: {
  pendentes: ReservaPendenteDeResposta[];
  mensagensPorReserva: Record<string, MensagemGraph[]>;
  internetIdsConhecidos?: Set<string>;
  persistirMock?: ReturnType<typeof vi.fn>;
}) {
  vi.resetModules();

  vi.doMock("./pending", () => ({
    listarReservasAguardandoResposta: vi.fn().mockResolvedValue(options.pendentes),
  }));

  vi.doMock("./queries", () => ({
    listarInternetMessageIdsConhecidos: vi.fn().mockResolvedValue(options.internetIdsConhecidos ?? new Set()),
  }));

  vi.doMock("@/lib/graph/read-mail", () => ({
    buscarMensagensDaConversa: vi.fn((envio: ReservaPendenteDeResposta["envios"][number]) => {
      const reserva = options.pendentes.find((p) => p.envios.includes(envio));
      return Promise.resolve(reserva ? options.mensagensPorReserva[reserva.reservationId] ?? [] : []);
    }),
  }));

  const persistirMock = options.persistirMock ?? vi.fn().mockResolvedValue({ id: "reply-1" });
  vi.doMock("./persist", () => ({ persistirInterpretacao: persistirMock }));

  vi.doMock("@/features/notifications/notify", () => ({ notificar: vi.fn().mockResolvedValue(undefined) }));

  return { persistirMock };
}

describe("processarLoteDeRespostas", () => {
  it("processa mensagem estruturada (regex) sem gastar chamada de IA", async () => {
    const pendente = pendenteBase();
    const { persistirMock } = await montarAmbiente({
      pendentes: [pendente],
      mensagensPorReserva: { "reserva-1": [mensagemBase()] },
    });

    const { processarLoteDeRespostas } = await import("./process-batch");
    const supabaseFake = {} as never;

    const resumo = await processarLoteDeRespostas(supabaseFake, { limiteReservas: 10, limiteChamadasIA: 5 });

    expect(resumo.reservasVerificadas).toBe(1);
    expect(resumo.mensagensEncontradas).toBe(1);
    expect(resumo.respostasProcessadas).toBe(1);
    expect(resumo.chamadasIA).toBe(0);
    expect(persistirMock).toHaveBeenCalledTimes(1);
  });

  it("aciona o circuit breaker e interrompe o lote após o limite de chamadas de IA", async () => {
    const pendente1 = pendenteBase({ emailSendId: "send-1", reservationId: "reserva-1" });
    const pendente2 = pendenteBase({ emailSendId: "send-2", reservationId: "reserva-2" });

    // Mensagens em texto livre (sem formato estruturado) forçam o caminho da IA.
    const mensagemTextoLivre = (id: string) =>
      mensagemBase({ id, internetMessageId: `<${id}@hotel.test>`, bodyContent: "<p>Confirmamos tudo certo por aqui.</p>" });

    vi.resetModules();
    vi.doMock("./pending", () => ({
      listarReservasAguardandoResposta: vi.fn().mockResolvedValue([pendente1, pendente2]),
    }));
    vi.doMock("./queries", () => ({
      listarInternetMessageIdsConhecidos: vi.fn().mockResolvedValue(new Set()),
    }));
    vi.doMock("@/lib/graph/read-mail", () => ({
      buscarMensagensDaConversa: vi.fn((envio: ReservaPendenteDeResposta["envios"][number]) => {
        if (pendente1.envios.includes(envio)) return Promise.resolve([mensagemTextoLivre("msg-1")]);
        if (pendente2.envios.includes(envio)) return Promise.resolve([mensagemTextoLivre("msg-2")]);
        return Promise.resolve([]);
      }),
    }));
    vi.doMock("./persist", () => ({ persistirInterpretacao: vi.fn().mockResolvedValue({ id: "reply-1" }) }));
    vi.doMock("@/lib/openai/client", async () => {
      const real = await vi.importActual<typeof import("@/lib/openai/client")>("@/lib/openai/client");
      return {
        ...real,
        interpretarRespostaIA: vi.fn().mockResolvedValue({
          analise: {
            reserva_confirmada: "SIM",
            regime_alimentar_confirmado: "SIM",
            numero_confirmacao_hotel: "HCN-1",
            confirmacoes_multiplas: [],
            status_pagamento: "PAGO",
            correspondencia_reserva: "CONFIRMADA",
            divergencias: [],
            evidencias_confirmacao: [],
            tipo_pendencia: "NENHUMA",
            pendencia: null,
            resumo_resposta: "Reserva confirmada.",
            confianca: 0.9,
          },
          consumo: { inputTokens: 10, outputTokens: 10, totalTokens: 20, custoUsd: 0.000001 },
        }),
      };
    });
    vi.doMock("@/features/notifications/notify", () => ({ notificar: vi.fn().mockResolvedValue(undefined) }));

    const { processarLoteDeRespostas } = await import("./process-batch");
    const supabaseFake = {} as never;

    // limiteChamadasIA = 1: a 1ª reserva consome a única chamada permitida, a 2ª nunca é processada.
    const resumo = await processarLoteDeRespostas(supabaseFake, { limiteReservas: 10, limiteChamadasIA: 1 });

    expect(resumo.chamadasIA).toBe(1);
    expect(resumo.circuitBreakerAcionado).toBe(true);
    expect(resumo.reservasVerificadas).toBe(1);

    vi.doUnmock("@/lib/openai/client");
  });

  it("isola erro de uma reserva sem interromper o processamento das demais", async () => {
    const pendente1 = pendenteBase({ emailSendId: "send-1", reservationId: "reserva-1" });
    const pendente2 = pendenteBase({ emailSendId: "send-2", reservationId: "reserva-2" });

    vi.resetModules();
    vi.doMock("./pending", () => ({
      listarReservasAguardandoResposta: vi.fn().mockResolvedValue([pendente1, pendente2]),
    }));
    vi.doMock("./queries", () => ({
      listarInternetMessageIdsConhecidos: vi.fn().mockResolvedValue(new Set()),
    }));
    vi.doMock("@/lib/graph/read-mail", () => ({
      buscarMensagensDaConversa: vi.fn((envio: ReservaPendenteDeResposta["envios"][number]) => {
        if (pendente1.envios.includes(envio)) return Promise.reject(new Error("Graph HTTP 500"));
        if (pendente2.envios.includes(envio)) return Promise.resolve([mensagemBase()]);
        return Promise.resolve([]);
      }),
    }));
    vi.doMock("./persist", () => ({ persistirInterpretacao: vi.fn().mockResolvedValue({ id: "reply-1" }) }));
    vi.doMock("@/features/notifications/notify", () => ({ notificar: vi.fn().mockResolvedValue(undefined) }));

    const { processarLoteDeRespostas } = await import("./process-batch");
    const supabaseFake = {} as never;

    const resumo = await processarLoteDeRespostas(supabaseFake, { limiteReservas: 10, limiteChamadasIA: 5 });

    expect(resumo.reservasVerificadas).toBe(2);
    expect(resumo.erros).toHaveLength(1);
    expect(resumo.erros[0].reservationId).toBe("reserva-1");
    expect(resumo.respostasProcessadas).toBe(1);
  });

  it("encontra a resposta que só chega na conversa do broker, não na do hotel (caso real YDKM7W/JM1XJW, 2026-11-26: Hotelbeds reconfirmou a reserva respondendo ao e-mail enviado via \"Enviar para Broker\", nunca na thread original com o hotel)", async () => {
    const pendente = pendenteBase({
      envios: [
        {
          destinatario: "reservas@hotel.test",
          conversationId: "conv-hotel",
          internetMessageId: "<envio-hotel@snow.test>",
          graphMessageId: "graph-envio-hotel",
          assunto: "Confirmação de reserva",
          localizador: "9QGJZN",
          dataEnvio: "2026-10-01T10:00:00Z",
        },
        {
          destinatario: "broker@hotelbeds.test",
          conversationId: "conv-broker",
          internetMessageId: "<envio-broker@snow.test>",
          graphMessageId: "graph-envio-broker",
          assunto: "Confirmação de reserva",
          localizador: "9QGJZN",
          dataEnvio: "2026-10-03T10:00:00Z",
        },
      ],
    });

    vi.resetModules();
    vi.doMock("./pending", () => ({
      listarReservasAguardandoResposta: vi.fn().mockResolvedValue([pendente]),
    }));
    vi.doMock("./queries", () => ({
      listarInternetMessageIdsConhecidos: vi.fn().mockResolvedValue(new Set()),
    }));
    vi.doMock("@/lib/graph/read-mail", () => ({
      buscarMensagensDaConversa: vi.fn((envio: ReservaPendenteDeResposta["envios"][number]) => {
        if (envio.destinatario === "reservas@hotel.test") return Promise.resolve([]);
        if (envio.destinatario === "broker@hotelbeds.test") return Promise.resolve([mensagemBase()]);
        return Promise.resolve([]);
      }),
    }));
    const persistirMock = vi.fn().mockResolvedValue({ id: "reply-1" });
    vi.doMock("./persist", () => ({ persistirInterpretacao: persistirMock }));
    vi.doMock("@/features/notifications/notify", () => ({ notificar: vi.fn().mockResolvedValue(undefined) }));

    const { processarLoteDeRespostas } = await import("./process-batch");
    const supabaseFake = {} as never;

    const resumo = await processarLoteDeRespostas(supabaseFake, { limiteReservas: 10, limiteChamadasIA: 5 });

    expect(resumo.mensagensEncontradas).toBe(1);
    expect(resumo.respostasProcessadas).toBe(1);
    expect(persistirMock).toHaveBeenCalledTimes(1);
    expect(persistirMock.mock.calls[0][1]).toBe("send-1");
  });
});
