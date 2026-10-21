// Teste de integração MANUAL — chama a Graph API de verdade contra a conta
// de teste do .env (MS_GRAPH_AUTHORIZED_EMAIL). Nunca roda em CI/suite
// automática (fora de src/**/*.test.ts, não é descoberto pelo Vitest) e
// nunca aponta para produtos1@bvgroup.com.br ou e-mail de hotel real
// (CLAUDE.md / PRD §7.1).
//
// Uso: npx tsx src/lib/graph/__integration__/send-mail.manual.ts

import { montarAssunto, montarCorpoHtml, envolverComAssinatura } from "../email-template";
import { enviarEmail } from "../send-mail";

async function main() {
  const destinatario = process.env.MS_GRAPH_AUTHORIZED_EMAIL;
  if (!destinatario) {
    throw new Error("MS_GRAPH_AUTHORIZED_EMAIL não configurado — abortando para não enviar a lugar incerto.");
  }

  const dadosReservaSintetica = {
    hotelNome: "Hotel Fictício Praia Azul",
    localizador: "9QGJZN",
    localizadorExterno: "EXT-TESTE-123",
    dataCheckin: "2026-12-10",
    dataCheckout: "2026-12-15",
    hospedes: [{ nome: "Hóspede Fictício Um" }, { nome: "Hóspede Fictício Dois" }],
    tipoHabitacao: "Standard Duplo",
    regimeAlimentar: "Café da manhã",
    fornecedor: "Fornecedor Fictício Turismo",
    pais: "Brasil",
  };

  const assunto = `[TESTE Milestone 7] ${montarAssunto(dadosReservaSintetica)}`;
  const corpoHtml = envolverComAssinatura(montarCorpoHtml(dadosReservaSintetica));

  console.log(`Enviando e-mail de teste para ${destinatario}...`);
  const resultado = await enviarEmail({ destinatario, assunto, corpoHtmlComAssinatura: corpoHtml });
  console.log(JSON.stringify(resultado, null, 2));

  if (!resultado.sucesso) {
    process.exitCode = 1;
  }
}

main();
