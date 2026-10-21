import { describe, expect, it } from "vitest";
import { determinarStatusAuditoria, mesclarEstadoAcumulado } from "./conversation-state";
import type { Database } from "@/lib/supabase/types";

type HotelReplyRow = Database["reconfirmacao"]["Tables"]["hotel_replies"]["Row"];

function respostaBase(overrides: Partial<HotelReplyRow> = {}): HotelReplyRow {
  return {
    id: "reply-1",
    email_send_id: "send-1",
    internet_message_id: "msg-1",
    recebido_em: "2026-10-01T10:00:00Z",
    corpo_texto: "corpo",
    metodo_interpretacao: "ia",
    reserva_confirmada: null,
    regime_alimentar_confirmado: null,
    numeros_confirmacao: [],
    status_pagamento: null,
    divergencias: null,
    pendencias: null,
    resumo: null,
    confianca: null,
    openai_tokens_input: null,
    openai_tokens_output: null,
    openai_custo_usd: null,
    created_at: "2026-10-01T10:00:00Z",
    ...overrides,
  };
}

describe("mesclarEstadoAcumulado (acúmulo de estado ao longo de tréplicas — PRD §4.1.3)", () => {
  it("mantém o HCN confirmado numa mensagem anterior quando a tréplica só fala de outro assunto", () => {
    const respostas = [
      respostaBase({
        id: "r1",
        recebido_em: "2026-10-01T10:00:00Z",
        reserva_confirmada: true,
        numeros_confirmacao: [{ hospede: "NAO_INFORMADO", numero_confirmacao: "HCN-999" }],
        status_pagamento: "PAGO",
      }),
      respostaBase({
        id: "r2",
        recebido_em: "2026-10-02T10:00:00Z",
        regime_alimentar_confirmado: true,
        // tréplica não repete reserva_confirmada/numero/pagamento — campos ficam null/vazio
      }),
    ];

    const estado = mesclarEstadoAcumulado(respostas);

    expect(estado.reservaConfirmada).toBe("SIM");
    expect(estado.numeroConfirmacaoHotel).toBe("HCN-999");
    expect(estado.statusPagamento).toBe("PAGO");
    expect(estado.regimeAlimentarConfirmado).toBe("SIM");
  });

  it("último valor não-neutro vence quando a tréplica contradiz a mensagem anterior", () => {
    const respostas = [
      respostaBase({ id: "r1", recebido_em: "2026-10-01T10:00:00Z", reserva_confirmada: false }),
      respostaBase({ id: "r2", recebido_em: "2026-10-02T10:00:00Z", reserva_confirmada: true }),
    ];
    expect(mesclarEstadoAcumulado(respostas).reservaConfirmada).toBe("SIM");
  });

  it("estado inicial é todo neutro quando não há respostas", () => {
    const estado = mesclarEstadoAcumulado([]);
    expect(estado.reservaConfirmada).toBe("INDEFINIDO");
    expect(estado.statusPagamento).toBe("NAO_INFORMADO");
  });
});

describe("determinarStatusAuditoria", () => {
  it("AGUARDANDO_RESPOSTA quando ainda não há nenhuma resposta do hotel", () => {
    const status = determinarStatusAuditoria({
      statusUltimoEnvio: "enviado",
      temResposta: false,
      estado: mesclarEstadoAcumulado([]),
      temPendencia: false,
    });
    expect(status).toBe("AGUARDANDO_RESPOSTA");
  });

  it("ERRO_NO_ENVIO quando o último envio falhou, mesmo que já exista resposta antiga", () => {
    const status = determinarStatusAuditoria({
      statusUltimoEnvio: "erro",
      temResposta: true,
      estado: mesclarEstadoAcumulado([]),
      temPendencia: false,
    });
    expect(status).toBe("ERRO_NO_ENVIO");
  });

  it("CONFIRMADA exige regime alimentar confirmado (PRD) — sem isso vai para REVISAR mesmo com reserva confirmada", () => {
    const estado = mesclarEstadoAcumulado([
      respostaBase({ reserva_confirmada: true, regime_alimentar_confirmado: null }),
    ]);
    const status = determinarStatusAuditoria({
      statusUltimoEnvio: "enviado",
      temResposta: true,
      estado,
      temPendencia: false,
    });
    expect(status).toBe("REVISAR");
  });

  it("CONFIRMADA quando reserva e regime alimentar estão confirmados e não há pendência", () => {
    const estado = mesclarEstadoAcumulado([
      respostaBase({ reserva_confirmada: true, regime_alimentar_confirmado: true }),
    ]);
    const status = determinarStatusAuditoria({
      statusUltimoEnvio: "enviado",
      temResposta: true,
      estado,
      temPendencia: false,
    });
    expect(status).toBe("CONFIRMADA");
  });

  it("NAO_CONFIRMADA quando o hotel nega a reserva (e regime n/a)", () => {
    const estado = mesclarEstadoAcumulado([
      respostaBase({ reserva_confirmada: false, regime_alimentar_confirmado: true }),
    ]);
    const status = determinarStatusAuditoria({
      statusUltimoEnvio: "enviado",
      temResposta: true,
      estado,
      temPendencia: false,
    });
    expect(status).toBe("NAO_CONFIRMADA");
  });

  it("REVISAR_DIVERGENCIA quando a correspondência acumulada é DIVERGENTE", () => {
    const estado = { ...mesclarEstadoAcumulado([]), correspondenciaReserva: "DIVERGENTE", regimeAlimentarConfirmado: "SIM" as const };
    const status = determinarStatusAuditoria({
      statusUltimoEnvio: "enviado",
      temResposta: true,
      estado,
      temPendencia: false,
    });
    expect(status).toBe("REVISAR_DIVERGENCIA");
  });

  it("REVISAR quando há pendência em aberto, mesmo com reserva confirmada", () => {
    const estado = mesclarEstadoAcumulado([
      respostaBase({ reserva_confirmada: true, regime_alimentar_confirmado: true }),
    ]);
    const status = determinarStatusAuditoria({
      statusUltimoEnvio: "enviado",
      temResposta: true,
      estado,
      temPendencia: true,
    });
    expect(status).toBe("REVISAR");
  });
});
