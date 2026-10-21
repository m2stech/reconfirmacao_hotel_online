import { describe, expect, it } from "vitest";
import { encontrarMelhorMatch, type HotelParaMatch } from "./match";

describe("encontrarMelhorMatch", () => {
  it("dá match de confiança máxima para nome idêntico (regressão: bug real do Milestone 8 — confirmação dupla de importação duplicou hotéis com nome idêntico por falha de matching)", () => {
    const hoteis: HotelParaMatch[] = [
      { id: "hotel-1", nome: "Barceló Torre de Madrid", nomesAlternativos: [] },
    ];
    const resultado = encontrarMelhorMatch("Barceló Torre de Madrid", hoteis);
    expect(resultado).toEqual({ hotelId: "hotel-1", confianca: 1 });
  });

  it("dá match para variação de grafia/sufixo acima do limiar automático", () => {
    const hoteis: HotelParaMatch[] = [
      { id: "hotel-1", nome: "Hotel Fictício Praia Azul", nomesAlternativos: [] },
    ];
    const resultado = encontrarMelhorMatch("HOTEL FICTICIO PRAIA AZUL LTDA", hoteis);
    expect(resultado.hotelId).toBe("hotel-1");
  });

  it("não dá match para hotel genuinamente diferente", () => {
    const hoteis: HotelParaMatch[] = [{ id: "hotel-1", nome: "Copacabana Palace", nomesAlternativos: [] }];
    const resultado = encontrarMelhorMatch("Hilton Lisbon", hoteis);
    expect(resultado.hotelId).toBeNull();
  });

  it("casa contra nomes alternativos, não só o nome principal", () => {
    const hoteis: HotelParaMatch[] = [
      { id: "hotel-1", nome: "W Prague", nomesAlternativos: ["W Prague Hotel LTDA"] },
    ];
    const resultado = encontrarMelhorMatch("W Prague Hotel LTDA", hoteis);
    expect(resultado.hotelId).toBe("hotel-1");
  });

  it("retorna hotelId null quando a lista de hotéis está vazia", () => {
    const resultado = encontrarMelhorMatch("Qualquer Hotel", []);
    expect(resultado).toEqual({ hotelId: null, confianca: 0 });
  });
});
