import { describe, expect, it } from "vitest";
import { htmlParaTexto } from "./text";

describe("htmlParaTexto", () => {
  it("converte tags de quebra de linha em \\n e remove o restante das tags", () => {
    const html = "<p>Reserva confirmada.</p><p>Pagamento: Pago</p>";
    expect(htmlParaTexto(html)).toBe("Reserva confirmada.\nPagamento: Pago");
  });

  it("decodifica entidades HTML comuns", () => {
    expect(htmlParaTexto("<p>Caf&eacute;? N&atilde;o, &amp; sim &quot;ok&quot;</p>")).toContain('"ok"');
  });

  it("remove histórico citado após 'Em ... escreveu:'", () => {
    const html =
      "<p>Confirmamos a reserva.</p><p>Em seg., 1 de out. de 2026, consultor@empresa.com escreveu:</p><p>Segue o pedido original...</p>";
    const resultado = htmlParaTexto(html);
    expect(resultado).toBe("Confirmamos a reserva.");
  });

  it("remove bloco de cabeçalho citado estilo Outlook (De/Enviado/Para/Assunto)", () => {
    const texto =
      "Confirmamos a reserva.\n\nDe: Consultor\nEnviado: segunda-feira\nPara: Hotel\nAssunto: Reconfirmação\n\nPor favor confirme...";
    const resultado = htmlParaTexto(texto);
    expect(resultado).toBe("Confirmamos a reserva.");
  });

  it("remove o caractere de controle _x000D_ do Excel", () => {
    expect(htmlParaTexto("Linha 1_x000D_Linha 2")).toBe("Linha 1Linha 2");
  });

  it("retorna string vazia para entrada nula/indefinida", () => {
    expect(htmlParaTexto(null)).toBe("");
    expect(htmlParaTexto(undefined)).toBe("");
  });
});
