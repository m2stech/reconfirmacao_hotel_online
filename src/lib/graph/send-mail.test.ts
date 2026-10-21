import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ENV_ORIGINAL = { ...process.env };

function respostaToken() {
  return new Response(JSON.stringify({ access_token: "fake-token", expires_in: 3599 }), { status: 200 });
}

describe("enviarEmail (mock total do Graph — nenhuma chamada real, PRD §7.1)", () => {
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

  it("cria rascunho, envia e retorna os ids de rastreamento em caso de sucesso", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes("login.microsoftonline.com")) return Promise.resolve(respostaToken());
      if (url.endsWith("/messages") && init?.method === "POST") {
        return Promise.resolve(new Response(JSON.stringify({ id: "msg-1" }), { status: 201 }));
      }
      if (url.endsWith("/messages/msg-1/send")) {
        return Promise.resolve(new Response(null, { status: 202 }));
      }
      if (url.includes("/messages/msg-1?")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({ id: "msg-1", conversationId: "conv-1", internetMessageId: "<abc@exemplo>" }),
            { status: 200 }
          )
        );
      }
      throw new Error(`Chamada inesperada: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { enviarEmail } = await import("./send-mail");
    const resultado = await enviarEmail({
      destinatario: "hotel@exemplo.test",
      assunto: "Assunto de teste",
      corpoHtmlComAssinatura: "<p>Corpo</p>",
    });

    expect(resultado).toEqual({
      sucesso: true,
      graphMessageId: "msg-1",
      conversationId: "conv-1",
      internetMessageId: "<abc@exemplo>",
    });

    const chamadaDeCriacao = fetchMock.mock.calls.find((chamada) => String(chamada[0]).endsWith("/messages"));
    const payloadEnviado = JSON.parse((chamadaDeCriacao![1] as RequestInit).body as string);
    expect(payloadEnviado.toRecipients[0].emailAddress.address).toBe("hotel@exemplo.test");
    expect(payloadEnviado.attachments).toHaveLength(1);
    expect(payloadEnviado.attachments[0].isInline).toBe(true);
  });

  it("retorna sucesso=false quando a criação do rascunho falha, sem lançar exceção", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("login.microsoftonline.com")) return Promise.resolve(respostaToken());
      return Promise.resolve(new Response("erro interno", { status: 500 }));
    });
    vi.stubGlobal("fetch", fetchMock);

    const { enviarEmail } = await import("./send-mail");
    const resultado = await enviarEmail({
      destinatario: "hotel@exemplo.test",
      assunto: "Assunto",
      corpoHtmlComAssinatura: "<p>Corpo</p>",
    });

    expect(resultado.sucesso).toBe(false);
    if (!resultado.sucesso) {
      expect(resultado.erro).toContain("HTTP 500");
    }
  });

  it("retorna sucesso=false quando o envio do rascunho falha (não 202)", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes("login.microsoftonline.com")) return Promise.resolve(respostaToken());
      if (url.endsWith("/messages") && init?.method === "POST") {
        return Promise.resolve(new Response(JSON.stringify({ id: "msg-1" }), { status: 201 }));
      }
      if (url.endsWith("/messages/msg-1/send")) {
        return Promise.resolve(new Response("falha de envio", { status: 403 }));
      }
      throw new Error(`Chamada inesperada: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { enviarEmail } = await import("./send-mail");
    const resultado = await enviarEmail({
      destinatario: "hotel@exemplo.test",
      assunto: "Assunto",
      corpoHtmlComAssinatura: "<p>Corpo</p>",
    });

    expect(resultado.sucesso).toBe(false);
  });
});
