import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ENV_ORIGINAL = { ...process.env };

function mockFetchToken(accessToken = "fake-token", expiresIn = 3599) {
  return vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ access_token: accessToken, expires_in: expiresIn, token_type: "Bearer" }), {
      status: 200,
    })
  );
}

describe("graphFetch (client credentials, nunca chamada real — PRD §7)", () => {
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

  it("troca client_id/client_secret por um access_token antes da chamada ao Graph", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: "fake-token", expires_in: 3599 }), { status: 200 })
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ value: [] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const { graphFetch } = await import("./client");
    const resposta = await graphFetch("/users/teste@exemplo.test/mailFolders");

    expect(resposta.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [tokenUrl, tokenInit] = fetchMock.mock.calls[0];
    expect(tokenUrl).toContain("login.microsoftonline.com/tenant-fake");
    expect(tokenInit.body.toString()).toContain("grant_type=client_credentials");

    const [graphUrl, graphInit] = fetchMock.mock.calls[1];
    expect(graphUrl).toBe("https://graph.microsoft.com/v1.0/users/teste@exemplo.test/mailFolders");
    expect(graphInit.headers.Authorization).toBe("Bearer fake-token");
  });

  it("reutiliza o token em cache dentro da validade, sem novo round-trip ao login.microsoftonline.com", async () => {
    const fetchMock = mockFetchToken();
    fetchMock.mockImplementation((url: string) => {
      if (url.includes("login.microsoftonline.com")) {
        return Promise.resolve(
          new Response(JSON.stringify({ access_token: "fake-token", expires_in: 3599 }), { status: 200 })
        );
      }
      return Promise.resolve(new Response("{}", { status: 200 }));
    });
    vi.stubGlobal("fetch", fetchMock);

    const { graphFetch } = await import("./client");
    await graphFetch("/users/teste@exemplo.test/mailFolders");
    await graphFetch("/users/teste@exemplo.test/messages");

    const chamadasDeToken = fetchMock.mock.calls.filter((chamada) =>
      String(chamada[0]).includes("login.microsoftonline.com")
    );
    expect(chamadasDeToken).toHaveLength(1);
  });

  it("propaga erro quando o token endpoint falha", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("invalid_client", { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);

    const { graphFetch } = await import("./client");
    await expect(graphFetch("/users/teste@exemplo.test/mailFolders")).rejects.toThrow(/HTTP 401/);
  });
});
