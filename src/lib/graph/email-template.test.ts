import { describe, expect, it } from "vitest";
import { idiomaPorPais, montarAssunto, montarCorpoHtml } from "./email-template";

const dadosBase = {
  hotelNome: "Hotel Fictício Praia Azul",
  localizador: "9QGJZN",
  localizadorExterno: "EXT-123",
  dataCheckin: "2026-12-10",
  dataCheckout: "2026-12-15",
  hospedes: [{ nome: "Hóspede Fictício Um" }, { nome: "Hóspede Fictício Dois" }],
  tipoHabitacao: "Standard Duplo",
  regimeAlimentar: "Café da manhã",
  fornecedor: "Fornecedor Fictício Turismo",
  pais: "Brasil",
};

describe("idiomaPorPais", () => {
  it("retorna pt para Brasil e Portugal", () => {
    expect(idiomaPorPais("Brasil")).toBe("pt");
    expect(idiomaPorPais("Portugal")).toBe("pt");
  });

  it("retorna es para países de língua espanhola", () => {
    expect(idiomaPorPais("Argentina")).toBe("es");
    expect(idiomaPorPais("México")).toBe("es");
  });

  it("retorna en como default para país desconhecido ou vazio", () => {
    expect(idiomaPorPais("Alemanha")).toBe("en");
    expect(idiomaPorPais(null)).toBe("en");
    expect(idiomaPorPais(undefined)).toBe("en");
  });
});

describe("montarAssunto", () => {
  it("monta assunto em português para hotel no Brasil", () => {
    expect(montarAssunto(dadosBase)).toBe(
      "Confirmação de reserva - Hotel Fictício Praia Azul - Checkin: 10/12/2026"
    );
  });

  it("monta assunto em espanhol para hotel na Argentina", () => {
    expect(montarAssunto({ ...dadosBase, pais: "Argentina" })).toContain("Confirmación de reserva");
  });

  it("monta assunto em inglês por default", () => {
    expect(montarAssunto({ ...dadosBase, pais: "Alemanha" })).toContain("Reservation confirmation");
  });
});

describe("montarCorpoHtml", () => {
  it("consolida todos os hóspedes num único corpo (1 e-mail por localizador)", () => {
    const corpo = montarCorpoHtml(dadosBase);
    expect(corpo).toContain("Hóspede Fictício Um");
    expect(corpo).toContain("Hóspede Fictício Dois");
  });

  it("escapa HTML dos campos vindos de dados externos (xlsx)", () => {
    const corpo = montarCorpoHtml({
      ...dadosBase,
      tipoHabitacao: '<img src=x onerror="alert(1)">',
    });
    expect(corpo).not.toContain("<img src=x");
    expect(corpo).toContain("&lt;img");
  });

  it("usa o localizador externo como localizador do broker quando presente", () => {
    const corpo = montarCorpoHtml(dadosBase);
    expect(corpo).toContain("EXT-123");
  });

  it("cai para o próprio localizador quando não há localizador externo", () => {
    const corpo = montarCorpoHtml({ ...dadosBase, localizadorExterno: null });
    expect(corpo).toContain("9QGJZN");
  });
});
