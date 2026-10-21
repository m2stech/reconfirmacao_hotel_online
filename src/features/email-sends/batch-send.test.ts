import { describe, expect, it, vi } from "vitest";

type TabelaMock = {
  auditStatus?: { reservation_id: string }[];
  reservas?: Record<string, unknown>[];
  hotel?: Record<string, unknown> | null;
};

function montarSupabaseFake(tabelas: TabelaMock) {
  return {
    schema() {
      return {
        from(tabela: string) {
          if (tabela === "audit_status") {
            return {
              select: () => ({
                eq: () => ({
                  limit: () => Promise.resolve({ data: tabelas.auditStatus ?? [], error: null }),
                }),
              }),
            };
          }
          if (tabela === "reservations") {
            return {
              select: () => ({
                in: () => Promise.resolve({ data: tabelas.reservas ?? [], error: null }),
              }),
            };
          }
          if (tabela === "hotels") {
            return {
              select: () => ({
                eq: () => ({
                  single: () => Promise.resolve({ data: tabelas.hotel ?? null, error: tabelas.hotel ? null : new Error("não encontrado") }),
                }),
              }),
            };
          }
          throw new Error(`tabela não mockada: ${tabela}`);
        },
      };
    },
  } as never;
}

describe("enviarReconfirmacoesPendentes", () => {
  it("não chama envio quando não há reserva NAO_ENVIADO", async () => {
    vi.resetModules();
    const enviarReconfirmacaoInicialMock = vi.fn();
    vi.doMock("./send", () => ({ enviarReconfirmacaoInicial: enviarReconfirmacaoInicialMock }));

    const { enviarReconfirmacoesPendentes } = await import("./batch-send");
    const supabase = montarSupabaseFake({ auditStatus: [] });

    const resumo = await enviarReconfirmacoesPendentes(supabase, "system-user-id", 10);

    expect(resumo.reservasVerificadas).toBe(0);
    expect(enviarReconfirmacaoInicialMock).not.toHaveBeenCalled();
    vi.doUnmock("./send");
  });

  it("pula reserva cujo hotel não tem e-mail confirmado, sem chamar envio", async () => {
    vi.resetModules();
    const enviarReconfirmacaoInicialMock = vi.fn();
    vi.doMock("./send", () => ({ enviarReconfirmacaoInicial: enviarReconfirmacaoInicialMock }));

    const { enviarReconfirmacoesPendentes } = await import("./batch-send");
    const supabase = montarSupabaseFake({
      auditStatus: [{ reservation_id: "res-1" }],
      reservas: [{ id: "res-1", localizador: "9QGJZN", hotel_id: "hotel-1", hospedes: [] }],
      hotel: { nome: "Hotel Teste", pais: "Brasil", hotel_emails: [{ email: "x@hotel.test", confiabilidade: "sugerido" }] },
    });

    const resumo = await enviarReconfirmacoesPendentes(supabase, "system-user-id", 10);

    expect(resumo.semEmailConfirmado).toBe(1);
    expect(enviarReconfirmacaoInicialMock).not.toHaveBeenCalled();
    vi.doUnmock("./send");
  });

  it("envia quando o hotel tem e-mail confirmado, passando o id do usuário de sistema (ação automática)", async () => {
    vi.resetModules();
    const enviarReconfirmacaoInicialMock = vi.fn().mockResolvedValue({ reservationId: "res-1", sucesso: true, emailSendId: "send-1" });
    vi.doMock("./send", () => ({ enviarReconfirmacaoInicial: enviarReconfirmacaoInicialMock }));

    const { enviarReconfirmacoesPendentes } = await import("./batch-send");
    const supabase = montarSupabaseFake({
      auditStatus: [{ reservation_id: "res-1" }],
      reservas: [{ id: "res-1", localizador: "9QGJZN", hotel_id: "hotel-1", hospedes: [{ nome: "Hóspede Um" }] }],
      hotel: { nome: "Hotel Teste", pais: "Brasil", hotel_emails: [{ email: "x@hotel.test", confiabilidade: "confirmado" }] },
    });

    const resumo = await enviarReconfirmacoesPendentes(supabase, "system-user-id", 10);

    expect(resumo.enviadas).toBe(1);
    expect(enviarReconfirmacaoInicialMock).toHaveBeenCalledTimes(1);
    expect(enviarReconfirmacaoInicialMock.mock.calls[0][2]).toBe("system-user-id");
    vi.doUnmock("./send");
  });

  it("reporta erro de envio sem interromper o lote", async () => {
    vi.resetModules();
    const enviarReconfirmacaoInicialMock = vi
      .fn()
      .mockResolvedValue({ reservationId: "res-1", sucesso: false, erro: "Graph HTTP 500", emailSendId: null });
    vi.doMock("./send", () => ({ enviarReconfirmacaoInicial: enviarReconfirmacaoInicialMock }));

    const { enviarReconfirmacoesPendentes } = await import("./batch-send");
    const supabase = montarSupabaseFake({
      auditStatus: [{ reservation_id: "res-1" }],
      reservas: [{ id: "res-1", localizador: "9QGJZN", hotel_id: "hotel-1", hospedes: [] }],
      hotel: { nome: "Hotel Teste", pais: "Brasil", hotel_emails: [{ email: "x@hotel.test", confiabilidade: "confirmado" }] },
    });

    const resumo = await enviarReconfirmacoesPendentes(supabase, "system-user-id", 10);

    expect(resumo.comErroDeEnvio).toHaveLength(1);
    expect(resumo.comErroDeEnvio[0].erro).toBe("Graph HTTP 500");
    vi.doUnmock("./send");
  });
});
