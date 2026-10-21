import { describe, expect, it } from "vitest";
import { ehMensagemAutomatica } from "./automatic-message";

describe("ehMensagemAutomatica", () => {
  it("detecta out-of-office pelo assunto", () => {
    expect(
      ehMensagemAutomatica({ assunto: "Out of Office: Re: Reconfirmação ABC123", remetente: "reservas@hotel.test", cabecalhoAutoSubmitted: null, cabecalhoPrecedence: null })
    ).toBe(true);
  });

  it("detecta resposta automática em português", () => {
    expect(
      ehMensagemAutomatica({ assunto: "Resposta automática", remetente: "reservas@hotel.test", cabecalhoAutoSubmitted: null, cabecalhoPrecedence: null })
    ).toBe(true);
  });

  it("detecta bounce (mail delivery failure)", () => {
    expect(
      ehMensagemAutomatica({ assunto: "Delivery Failure", remetente: "postmaster@hotel.test", cabecalhoAutoSubmitted: null, cabecalhoPrecedence: null })
    ).toBe(true);
  });

  it("detecta remetente automático mesmo com assunto normal", () => {
    expect(
      ehMensagemAutomatica({ assunto: "Re: Reconfirmação", remetente: "no-reply@hotel.test", cabecalhoAutoSubmitted: null, cabecalhoPrecedence: null })
    ).toBe(true);
  });

  it("detecta via cabeçalho Auto-Submitted", () => {
    expect(
      ehMensagemAutomatica({ assunto: "Re: Reconfirmação", remetente: "reservas@hotel.test", cabecalhoAutoSubmitted: "auto-replied", cabecalhoPrecedence: null })
    ).toBe(true);
  });

  it("detecta via cabeçalho Precedence: bulk", () => {
    expect(
      ehMensagemAutomatica({ assunto: "Re: Reconfirmação", remetente: "reservas@hotel.test", cabecalhoAutoSubmitted: null, cabecalhoPrecedence: "bulk" })
    ).toBe(true);
  });

  it("não marca resposta normal do hotel como automática", () => {
    expect(
      ehMensagemAutomatica({ assunto: "Re: Reconfirmação ABC123", remetente: "reservas@hotel.test", cabecalhoAutoSubmitted: "no", cabecalhoPrecedence: null })
    ).toBe(false);
  });
});
