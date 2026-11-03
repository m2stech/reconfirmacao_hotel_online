import { describe, expect, it, vi } from "vitest";
import type { ReservaElegivelParaCobranca } from "./collection-pending";

function reservaBase(overrides: Partial<ReservaElegivelParaCobranca> = {}): ReservaElegivelParaCobranca {
  return {
    reservationId: "res-1",
    emailSendId: "send-1",
    destinatario: "reservas@hotel.test",
    assuntoOriginal: "Confirmação de reserva - Hotel Teste - Checkin: 15/12/2026",
    paisHotel: "Brasil",
    graphMessageId: "graph-1",
    internetMessageId: "<envio@snow.test>",
    localizador: "9QGJZN",
    tentativas: 0,
    createdByEnvioOriginal: "user-1",
    ...overrides,
  };
}

function montarSupabaseFake() {
  const updates: Record<string, unknown>[] = [];
  return {
    fake: {
      schema() {
        return {
          from(tabela: string) {
            if (tabela === "reservations") {
              return {
                update: (valores: Record<string, unknown>) => ({
                  eq: () => {
                    updates.push(valores);
                    return Promise.resolve({ error: null });
                  },
                }),
              };
            }
            throw new Error(`tabela não mockada: ${tabela}`);
          },
        };
      },
    } as never,
    updates,
  };
}

async function montarAmbiente(options: {
  elegiveis: ReservaElegivelParaCobranca[];
  responderHotelMock?: ReturnType<typeof vi.fn>;
}) {
  vi.resetModules();

  vi.doMock("./collection-pending", () => ({
    listarReservasParaCobranca: vi.fn().mockResolvedValue(options.elegiveis),
    MAX_TENTATIVAS_COBRANCA: 3,
    INTERVALO_COBRANCA_HORAS: 24,
  }));

  const responderHotelMock =
    options.responderHotelMock ??
    vi.fn().mockResolvedValue({
      sucesso: true,
      graphMessageId: "graph-novo",
      conversationId: "conv-1",
      internetMessageId: "<cobranca@snow.test>",
      corpoHtml: "<p>cobrança</p>",
    });
  vi.doMock("@/lib/graph/reply", () => ({ responderHotel: responderHotelMock }));

  const registrarEnvioMock = vi.fn().mockResolvedValue({ id: "send-cobranca" });
  vi.doMock("@/features/email-sends/queries", () => ({ registrarEnvio: registrarEnvioMock }));

  const notificarMock = vi.fn().mockResolvedValue(undefined);
  vi.doMock("@/features/notifications/notify", () => ({ notificar: notificarMock }));

  return { responderHotelMock, registrarEnvioMock, notificarMock };
}

describe("processarLoteDeCobranca", () => {
  it("envia cobrança e incrementa o contador quando ainda não atingiu o limite", async () => {
    const { responderHotelMock, registrarEnvioMock, notificarMock } = await montarAmbiente({
      elegiveis: [reservaBase({ tentativas: 0 })],
    });

    const { processarLoteDeCobranca } = await import("./collection");
    const { fake, updates } = montarSupabaseFake();

    const resumo = await processarLoteDeCobranca(fake, { limiteReservas: 10 });

    expect(resumo.cobrancasEnviadas).toBe(1);
    expect(resumo.slaEsgotado).toBe(0);
    const assuntoEsperado = "RE: Confirmação de reserva - Hotel Teste - Checkin: 15/12/2026 - cobrança 1/3";
    expect(responderHotelMock).toHaveBeenCalledWith(expect.objectContaining({ novoAssunto: assuntoEsperado }));
    expect(registrarEnvioMock).toHaveBeenCalledWith(
      fake,
      expect.objectContaining({ status: "enviado", reservation_id: "res-1", assunto: assuntoEsperado })
    );
    expect(updates[0]).toMatchObject({ cobranca_tentativas: 1 });
    expect(notificarMock).not.toHaveBeenCalled();
  });

  it("usa o idioma do país do hotel na cobrança, não português fixo (caso real: hotel na China)", async () => {
    const { responderHotelMock, registrarEnvioMock } = await montarAmbiente({
      elegiveis: [
        reservaBase({
          tentativas: 0,
          paisHotel: "China",
          assuntoOriginal: "Reservation confirmation - Holiday Inn Zhengzhou - Checkin: 04/11/2026",
        }),
      ],
    });

    const { processarLoteDeCobranca } = await import("./collection");
    const { fake } = montarSupabaseFake();

    await processarLoteDeCobranca(fake, { limiteReservas: 10 });

    const assuntoEsperado = "RE: Reservation confirmation - Holiday Inn Zhengzhou - Checkin: 04/11/2026 - reminder 1/3";
    expect(responderHotelMock).toHaveBeenCalledWith(
      expect.objectContaining({
        novoAssunto: assuntoEsperado,
        textoUsuario: expect.stringContaining("Hello, we have not yet received"),
      })
    );
    expect(registrarEnvioMock).toHaveBeenCalledWith(fake, expect.objectContaining({ assunto: assuntoEsperado }));
  });

  it("não envia, notifica sla_esgotado e grava sentinela quando já atingiu as 3 tentativas", async () => {
    const { responderHotelMock, notificarMock } = await montarAmbiente({
      elegiveis: [reservaBase({ tentativas: 3 })],
    });

    const { processarLoteDeCobranca } = await import("./collection");
    const { fake, updates } = montarSupabaseFake();

    const resumo = await processarLoteDeCobranca(fake, { limiteReservas: 10 });

    expect(resumo.slaEsgotado).toBe(1);
    expect(resumo.cobrancasEnviadas).toBe(0);
    expect(responderHotelMock).not.toHaveBeenCalled();
    expect(notificarMock).toHaveBeenCalledWith(fake, expect.objectContaining({ tipo: "sla_esgotado", reservationId: "res-1" }));
    // Sentinela (MAX + 1): impede notificar sla_esgotado de novo no próximo disparo do cron.
    expect(updates[0]).toMatchObject({ cobranca_tentativas: 4 });
  });

  it("registra erro e notifica quando o envio da cobrança falha, sem lançar", async () => {
    const { notificarMock } = await montarAmbiente({
      elegiveis: [reservaBase({ tentativas: 1 })],
      responderHotelMock: vi.fn().mockResolvedValue({ sucesso: false, erro: "Graph HTTP 500" }),
    });

    const { processarLoteDeCobranca } = await import("./collection");
    const { fake } = montarSupabaseFake();

    const resumo = await processarLoteDeCobranca(fake, { limiteReservas: 10 });

    expect(resumo.cobrancasEnviadas).toBe(0);
    expect(resumo.erros).toHaveLength(0);
    expect(notificarMock).toHaveBeenCalledWith(fake, expect.objectContaining({ tipo: "erro_envio" }));
  });

  it("isola erro de uma reserva sem interromper o processamento das demais", async () => {
    const reserva1 = reservaBase({ reservationId: "res-1", emailSendId: "send-1", destinatario: "reservas@hotel-1.test" });
    const reserva2 = reservaBase({ reservationId: "res-2", emailSendId: "send-2", destinatario: "reservas@hotel-2.test" });

    vi.resetModules();
    vi.doMock("./collection-pending", () => ({
      listarReservasParaCobranca: vi.fn().mockResolvedValue([reserva1, reserva2]),
      MAX_TENTATIVAS_COBRANCA: 3,
      INTERVALO_COBRANCA_HORAS: 24,
    }));
    vi.doMock("@/lib/graph/reply", () => ({
      responderHotel: vi.fn().mockImplementation((params: { destinatario: string }) => {
        if (params.destinatario === reserva1.destinatario) return Promise.reject(new Error("falha inesperada"));
        return Promise.resolve({
          sucesso: true,
          graphMessageId: "graph-novo",
          conversationId: "conv-1",
          internetMessageId: "<cobranca@snow.test>",
          corpoHtml: "<p>cobrança</p>",
        });
      }),
    }));
    vi.doMock("@/features/email-sends/queries", () => ({ registrarEnvio: vi.fn().mockResolvedValue({ id: "send-cobranca" }) }));
    vi.doMock("@/features/notifications/notify", () => ({ notificar: vi.fn().mockResolvedValue(undefined) }));

    const { processarLoteDeCobranca } = await import("./collection");
    const { fake } = montarSupabaseFake();

    const resumo = await processarLoteDeCobranca(fake, { limiteReservas: 10 });

    expect(resumo.reservasVerificadas).toBe(2);
    expect(resumo.erros).toHaveLength(1);
    expect(resumo.erros[0].reservationId).toBe("res-1");
    expect(resumo.cobrancasEnviadas).toBe(1);
  });
});
