import { describe, expect, it } from "vitest";
import { extrairNumeroConfirmacaoFallback, interpretarRespostaRegex } from "./regex-fallback";

describe("interpretarRespostaRegex", () => {
  it("reconhece resposta estruturada completa (reserva confirmada + pagamento)", () => {
    const corpo = `Olá,\n\nReserva confirmada: SIM\nNumero de confirmacao: HCN-12345\nPagamento: Pago\nObservacoes: Tudo certo\n\nAtenciosamente,`;
    const resultado = interpretarRespostaRegex(corpo);

    expect(resultado).not.toBeNull();
    expect(resultado?.reserva_confirmada).toBe("SIM");
    expect(resultado?.numero_confirmacao_hotel).toBe("HCN-12345");
    expect(resultado?.status_pagamento).toBe("PAGO");
    expect(resultado?.pendencia).toBeNull();
    expect(resultado?._metodoInterpretacao).toBe("REGEX");
  });

  it("reconhece pagamento pendente e gera tipo de pendência PAGAMENTO", () => {
    const corpo = `Reserva confirmada: SIM\nPagamento: Pendente`;
    const resultado = interpretarRespostaRegex(corpo);

    expect(resultado?.status_pagamento).toBe("PENDENTE");
    expect(resultado?.tipo_pendencia).toBe("PAGAMENTO");
  });

  it("reconhece reserva não confirmada", () => {
    const corpo = `Reserva confirmada: NAO\nPagamento: Pendente`;
    const resultado = interpretarRespostaRegex(corpo);

    expect(resultado?.reserva_confirmada).toBe("NAO");
    expect(resultado?.tipo_pendencia).toBe("OUTRA");
  });

  it("extrai observação como pendência operacional quando reserva está confirmada e paga", () => {
    const corpo = `Reserva confirmada: SIM\nPagamento: Pago\nObservacoes: Hóspede precisa confirmar horário de chegada`;
    const resultado = interpretarRespostaRegex(corpo);

    expect(resultado?.tipo_pendencia).toBe("OPERACIONAL");
    expect(resultado?.pendencia).toBe("Hóspede precisa confirmar horário de chegada");
  });

  it("retorna null quando o campo reserva confirmada está no formato de template (SIM/NAO literal)", () => {
    const corpo = `Reserva confirmada: SIM/NAO\nPagamento: Pago`;
    expect(interpretarRespostaRegex(corpo)).toBeNull();
  });

  it("retorna null quando não reconhece o formato estruturado (resposta em texto livre)", () => {
    const corpo = `Olá, confirmamos a reserva do hóspede João Silva para as datas solicitadas. Qualquer dúvida estamos à disposição.`;
    expect(interpretarRespostaRegex(corpo)).toBeNull();
  });

  it("ignora número de confirmação com valor de placeholder (N/A)", () => {
    const corpo = `Reserva confirmada: SIM\nNumero de confirmacao: N/A\nPagamento: Pago`;
    const resultado = interpretarRespostaRegex(corpo);
    expect(resultado?.numero_confirmacao_hotel).toBeNull();
  });
});

describe("extrairNumeroConfirmacaoFallback", () => {
  it("extrai número a partir do rótulo HCN", () => {
    expect(extrairNumeroConfirmacaoFallback("HCN interno: 998877")).toBe("998877");
  });

  it("extrai número a partir de 'confirmation number is'", () => {
    expect(extrairNumeroConfirmacaoFallback("Your confirmation number is ABC1234")).toBe("ABC1234");
  });

  it("não extrai número com menos de 4 caracteres (ex: código isolado)", () => {
    expect(extrairNumeroConfirmacaoFallback("confirmação: AB")).toBeNull();
  });

  it("retorna null quando não há nenhum padrão reconhecido", () => {
    expect(extrairNumeroConfirmacaoFallback("Obrigado pelo contato, em breve retornaremos.")).toBeNull();
  });
});
