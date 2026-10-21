import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ENV_ORIGINAL = { ...process.env };

function respostaToken() {
  return new Response(JSON.stringify({ access_token: "fake-token", expires_in: 3599 }), { status: 200 });
}

describe("responderHotel (reply preservando thread — mock total do Graph)", () => {
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

  it("segue createReply -> patch -> send e injeta o texto do usuário antes da citação", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes("login.microsoftonline.com")) return Promise.resolve(respostaToken());
      if (url.endsWith("/messages/msg-original/createReply")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              id: "rascunho-1",
              conversationId: "conv-1",
              internetMessageId: "<reply@exemplo>",
              body: { content: "<html><body>Mensagem original citada</body></html>" },
            }),
            { status: 201 }
          )
        );
      }
      if (url.endsWith("/messages/rascunho-1") && init?.method === "PATCH") {
        return Promise.resolve(new Response(JSON.stringify({ id: "rascunho-1" }), { status: 200 }));
      }
      if (url.endsWith("/messages/rascunho-1/send")) {
        return Promise.resolve(new Response(null, { status: 202 }));
      }
      throw new Error(`Chamada inesperada: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { responderHotel } = await import("./reply");
    const resultado = await responderHotel({
      graphMessageIdOriginal: "msg-original",
      internetMessageIdOriginal: null,
      destinatario: "hotel@exemplo.test",
      novoAssunto: "RE: Confirmação de reserva",
      textoUsuario: "Obrigado pela confirmação.",
    });

    expect(resultado.sucesso).toBe(true);
    if (resultado.sucesso) {
      expect(resultado.corpoHtml).toContain("Obrigado pela confirmação.");
      expect(resultado.corpoHtml.indexOf("Obrigado pela confirmação.")).toBeLessThan(
        resultado.corpoHtml.indexOf("Mensagem original citada")
      );
    }
  });

  it("procura o graphMessageId por internetMessageId quando o original não é informado", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes("login.microsoftonline.com")) return Promise.resolve(respostaToken());
      if (url.includes("$filter=internetMessageId")) {
        return Promise.resolve(
          new Response(JSON.stringify({ value: [{ id: "msg-encontrado" }] }), { status: 200 })
        );
      }
      if (url.endsWith("/messages/msg-encontrado/createReply")) {
        return Promise.resolve(
          new Response(JSON.stringify({ id: "rascunho-2", body: { content: "<body></body>" } }), { status: 201 })
        );
      }
      if (url.endsWith("/messages/rascunho-2") && init?.method === "PATCH") {
        return Promise.resolve(new Response("{}", { status: 200 }));
      }
      if (url.endsWith("/messages/rascunho-2/send")) {
        return Promise.resolve(new Response(null, { status: 202 }));
      }
      throw new Error(`Chamada inesperada: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { responderHotel } = await import("./reply");
    const resultado = await responderHotel({
      graphMessageIdOriginal: null,
      internetMessageIdOriginal: "<original@exemplo>",
      destinatario: "hotel@exemplo.test",
      novoAssunto: "RE: Confirmação",
      textoUsuario: "Texto",
    });

    expect(resultado.sucesso).toBe(true);
  });

  it("retorna erro quando não há graphMessageId nem internetMessageId para localizar a mensagem original", async () => {
    vi.stubGlobal("fetch", vi.fn());

    const { responderHotel } = await import("./reply");
    const resultado = await responderHotel({
      graphMessageIdOriginal: null,
      internetMessageIdOriginal: null,
      destinatario: "hotel@exemplo.test",
      novoAssunto: "RE: Confirmação",
      textoUsuario: "Texto",
    });

    expect(resultado.sucesso).toBe(false);
  });
});
