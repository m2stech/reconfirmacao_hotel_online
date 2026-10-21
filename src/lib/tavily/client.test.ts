import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ENV_ORIGINAL = { ...process.env };

describe("buscarContatoHotel (Tavily, nunca chamada real em teste de unidade — PRD §7.3)", () => {
  beforeEach(() => {
    process.env.TAVILY_API_KEY = "tvly-fake";
  });

  afterEach(() => {
    process.env = { ...ENV_ORIGINAL };
    vi.unstubAllGlobals();
  });

  it("extrai e-mail e país numa única chamada, com alta confiança quando o email está na resposta sintetizada", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          answer: "The reservations email for Hotel Fictício is reservas@hotelficticio.test, located in Portugal.",
          results: [{ content: "Contact: reservas@hotelficticio.test" }],
        }),
        { status: 200 }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const { buscarContatoHotel } = await import("./client");
    const resultado = await buscarContatoHotel("Hotel Fictício");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.tavily.com/search");
    const corpo = JSON.parse(init.body as string);
    expect(corpo.query).toContain("Hotel Fictício");
    expect(corpo.query).toContain("country (not city)");

    expect(resultado.email).toBe("reservas@hotelficticio.test");
    expect(resultado.confiancaEmail).toBeGreaterThan(0.5);
    expect(resultado.pais).toBe("Portugal");
    expect(resultado.confiancaPais).toBeGreaterThan(0);
  });

  it("prioriza menção explícita de país sobre a primeira cidade citada na resposta (caso real observado em teste de integração)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          answer:
            "The sources do not provide the reservations email address. The country of Portugal is implied by the Hilton announcement about the hotels in Lisbon.",
          results: [],
        }),
        { status: 200 }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const { buscarContatoHotel } = await import("./client");
    const resultado = await buscarContatoHotel("Hilton Lisbon");

    expect(resultado.pais).toBe("Portugal");
  });

  it("ignora e-mails de domínios de OTA/agregador, não os trata como contato do hotel", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          answer: "No reservations email found.",
          results: [{ content: "noreply@booking.com mentioned this hotel" }],
        }),
        { status: 200 }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const { buscarContatoHotel } = await import("./client");
    const resultado = await buscarContatoHotel("Hotel Sem Contato Próprio");

    expect(resultado.email).toBeNull();
    expect(resultado.confiancaEmail).toBe(0);
  });

  it("não confunde a própria página institucional da Tavily com contato do hotel, para hotel inexistente/sintético (caso real observado em teste de integração)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          answer:
            "The sources do not provide the reservations email address or country of the hotel. The Tavily website mentions a support email of support@tavily.com but does not mention any hotel-specific contact information.",
          results: [
            { content: "support@tavily.com", score: 0.2 },
            { url: "https://tavily.com", content: "Contact: support@tavily.com", score: 0.2 },
          ],
        }),
        { status: 200 }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const { buscarContatoHotel } = await import("./client");
    const resultado = await buscarContatoHotel("Hotel Sintético Inexistente");

    expect(resultado.email).toBeNull();
    expect(resultado.pais).toBeNull();
  });

  it("ignora conteúdo de resultados com score de relevância baixo, mesmo que contenham e-mail", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          answer: "No direct contact found.",
          results: [{ content: "unrelated@random-blog.test", score: 0.05 }],
        }),
        { status: 200 }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const { buscarContatoHotel } = await import("./client");
    const resultado = await buscarContatoHotel("Hotel Qualquer");

    expect(resultado.email).toBeNull();
  });

  it("retorna email/país nulos com confiança zero quando nada é encontrado", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ answer: "", results: [] }), { status: 200 })
    );
    vi.stubGlobal("fetch", fetchMock);

    const { buscarContatoHotel } = await import("./client");
    const resultado = await buscarContatoHotel("Hotel Desconhecido");

    expect(resultado).toEqual({ email: null, confiancaEmail: 0, pais: null, confiancaPais: 0 });
  });

  it("propaga erro quando a API Tavily responde com falha", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("rate limited", { status: 429 }));
    vi.stubGlobal("fetch", fetchMock);

    const { buscarContatoHotel } = await import("./client");
    await expect(buscarContatoHotel("Hotel Qualquer")).rejects.toThrow(/HTTP 429/);
  });

  it("lança erro claro se TAVILY_API_KEY não estiver configurada", async () => {
    delete process.env.TAVILY_API_KEY;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { buscarContatoHotel } = await import("./client");
    await expect(buscarContatoHotel("Hotel Qualquer")).rejects.toThrow(/TAVILY_API_KEY/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
