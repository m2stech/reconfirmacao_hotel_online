import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EnvioParaBuscaDeResposta } from "./read-mail";

const ENV_ORIGINAL = { ...process.env };

function mensagemBruta(overrides: Record<string, unknown> = {}) {
  return {
    id: "msg-1",
    conversationId: "conv-1",
    internetMessageId: "<msg-1@hotel.test>",
    subject: "Re: Reconfirmação 9QGJZN",
    receivedDateTime: "2026-10-02T10:00:00Z",
    body: { content: "<p>Reserva confirmada.</p>" },
    bodyPreview: "Reserva confirmada.",
    from: { emailAddress: { address: "reservas@hotel.test" } },
    internetMessageHeaders: [],
    ...overrides,
  };
}

function envioBase(overrides: Partial<EnvioParaBuscaDeResposta> = {}): EnvioParaBuscaDeResposta {
  return {
    destinatario: "reservas@hotel.test",
    conversationId: "conv-1",
    internetMessageId: "<envio-original@snow.test>",
    graphMessageId: "graph-envio-original",
    assunto: "Confirmação de reserva - Hotel Teste - Checkin: 10/12/2026",
    localizador: "9QGJZN",
    dataEnvio: "2026-10-01T10:00:00Z",
    ...overrides,
  };
}

function mockGraphFetch(mensagens: ReturnType<typeof mensagemBruta>[]) {
  return vi
    .fn()
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ access_token: "fake-token", expires_in: 3599 }), { status: 200 })
    )
    .mockResolvedValueOnce(new Response(JSON.stringify({ value: mensagens }), { status: 200 }));
}

describe("buscarMensagensDaConversa", () => {
  beforeEach(() => {
    process.env.MS_GRAPH_TENANT_ID = "tenant-fake";
    process.env.MS_GRAPH_CLIENT_ID = "client-fake";
    process.env.MS_GRAPH_CLIENT_SECRET = "secret-fake";
    process.env.MS_GRAPH_AUTHORIZED_EMAIL = "teste@exemplo.test";
    vi.resetModules();
  });

  afterEach(() => {
    process.env = { ...ENV_ORIGINAL };
    vi.unstubAllGlobals();
  });

  it("retorna a mensagem do hotel quando remetente bate com o destinatário do envio", async () => {
    vi.stubGlobal("fetch", mockGraphFetch([mensagemBruta()]));
    const { buscarMensagensDaConversa } = await import("./read-mail");

    const resultado = await buscarMensagensDaConversa(envioBase(), new Set());
    expect(resultado).toHaveLength(1);
    expect(resultado[0].id).toBe("msg-1");
  });

  it("filtra fora mensagem cujo remetente não é o destinatário do envio (ex: nossa própria cópia em Sent Items)", async () => {
    vi.stubGlobal(
      "fetch",
      mockGraphFetch([mensagemBruta({ from: { emailAddress: { address: "consultor@snow.test" } } })])
    );
    const { buscarMensagensDaConversa } = await import("./read-mail");

    const resultado = await buscarMensagensDaConversa(envioBase(), new Set());
    expect(resultado).toHaveLength(0);
  });

  it("filtra fora mensagem anterior à data de envio", async () => {
    vi.stubGlobal("fetch", mockGraphFetch([mensagemBruta({ receivedDateTime: "2026-09-30T10:00:00Z" })]));
    const { buscarMensagensDaConversa } = await import("./read-mail");

    const resultado = await buscarMensagensDaConversa(envioBase(), new Set());
    expect(resultado).toHaveLength(0);
  });

  it("filtra fora mensagem já conhecida (internetMessageId já registrado em hotel_replies)", async () => {
    vi.stubGlobal("fetch", mockGraphFetch([mensagemBruta()]));
    const { buscarMensagensDaConversa } = await import("./read-mail");

    const resultado = await buscarMensagensDaConversa(envioBase(), new Set(["<msg-1@hotel.test>"]));
    expect(resultado).toHaveLength(0);
  });

  it("mantém a correspondência quando não há conversationId mas o assunto cita o localizador", async () => {
    vi.stubGlobal(
      "fetch",
      mockGraphFetch([mensagemBruta({ conversationId: "conv-outra", subject: "RE: 9QGJZN confirmação" })])
    );
    const { buscarMensagensDaConversa } = await import("./read-mail");

    const resultado = await buscarMensagensDaConversa(envioBase({ conversationId: null }), new Set());
    expect(resultado).toHaveLength(1);
  });

  it("ordena mensagens por data de recebimento ascendente", async () => {
    vi.stubGlobal(
      "fetch",
      mockGraphFetch([
        mensagemBruta({ id: "msg-2", internetMessageId: "<msg-2@hotel.test>", receivedDateTime: "2026-10-03T10:00:00Z" }),
        mensagemBruta({ id: "msg-1", internetMessageId: "<msg-1@hotel.test>", receivedDateTime: "2026-10-02T10:00:00Z" }),
      ])
    );
    const { buscarMensagensDaConversa } = await import("./read-mail");

    const resultado = await buscarMensagensDaConversa(envioBase(), new Set());
    expect(resultado.map((m) => m.id)).toEqual(["msg-1", "msg-2"]);
  });
});
