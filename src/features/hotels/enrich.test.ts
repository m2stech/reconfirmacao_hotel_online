import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/tavily/client", () => ({
  buscarContatoHotel: vi.fn(),
}));

// Supabase client fake mínimo: só precisa suportar a cadeia usada por
// enrich.ts (.schema().from().insert().select().single()).
function criarSupabaseFake() {
  const inserts: { tabela: string; valores: unknown }[] = [];
  let proximoIdHotel = "hotel-fake-id";

  const client = {
    schema: () => ({
      from: (tabela: string) => ({
        insert: (valores: unknown) => {
          inserts.push({ tabela, valores });
          return {
            select: () => ({
              single: async () => ({ data: { id: proximoIdHotel }, error: null }),
            }),
          };
        },
      }),
    }),
  };

  return { client, inserts, setProximoIdHotel: (id: string) => (proximoIdHotel = id) };
}

describe("criarHotelComEnriquecimentoTavily (Milestone 8, Tavily mockado — PRD §7.3)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });
  afterEach(() => vi.restoreAllMocks());

  it("grava e-mail como sugestão (confiabilidade 'sugerido', fonte 'tavily') quando a confiança supera o limiar", async () => {
    const { buscarContatoHotel } = await import("@/lib/tavily/client");
    vi.mocked(buscarContatoHotel).mockResolvedValue({
      email: "reservas@hotel.test",
      confiancaEmail: 0.7,
      pais: "Portugal",
      confiancaPais: 0.6,
    });

    const { criarHotelComEnriquecimentoTavily } = await import("./enrich");
    const { client, inserts } = criarSupabaseFake();

    const resultado = await criarHotelComEnriquecimentoTavily(client as never, "Hotel Teste");

    expect(resultado.enriquecimento.emailEncontrado).toBe("reservas@hotel.test");
    expect(resultado.enriquecimento.paisEncontrado).toBe("Portugal");

    const insertHotel = inserts.find((i) => i.tabela === "hotels");
    expect(insertHotel?.valores).toMatchObject({
      nome: "Hotel Teste",
      pais: "Portugal",
      pais_fonte: "tavily",
      pais_a_confirmar: true,
      confiabilidade_contato: "sugerido",
    });

    const insertEmail = inserts.find((i) => i.tabela === "hotel_emails");
    expect(insertEmail?.valores).toMatchObject({
      email: "reservas@hotel.test",
      fonte: "tavily",
      confiabilidade: "sugerido",
    });
  });

  it("cria o hotel sem contato quando a confiança do Tavily fica abaixo do limiar mínimo", async () => {
    const { buscarContatoHotel } = await import("@/lib/tavily/client");
    vi.mocked(buscarContatoHotel).mockResolvedValue({
      email: "achado@duvidoso.test",
      confiancaEmail: 0.1,
      pais: null,
      confiancaPais: 0,
    });

    const { criarHotelComEnriquecimentoTavily } = await import("./enrich");
    const { client, inserts } = criarSupabaseFake();

    const resultado = await criarHotelComEnriquecimentoTavily(client as never, "Hotel Duvidoso");

    expect(resultado.enriquecimento.emailEncontrado).toBeNull();
    expect(inserts.find((i) => i.tabela === "hotel_emails")).toBeUndefined();
  });

  it("cria o hotel sem contato quando a busca Tavily falha, sem bloquear a importação da reserva", async () => {
    const { buscarContatoHotel } = await import("@/lib/tavily/client");
    vi.mocked(buscarContatoHotel).mockRejectedValue(new Error("Tavily indisponível"));

    const { criarHotelComEnriquecimentoTavily } = await import("./enrich");
    const { client, inserts } = criarSupabaseFake();

    const resultado = await criarHotelComEnriquecimentoTavily(client as never, "Hotel Qualquer");

    expect(resultado.hotelId).toBe("hotel-fake-id");
    expect(resultado.enriquecimento).toEqual({ emailEncontrado: null, paisEncontrado: null });
    expect(inserts.find((i) => i.tabela === "hotel_emails")).toBeUndefined();
  });
});
