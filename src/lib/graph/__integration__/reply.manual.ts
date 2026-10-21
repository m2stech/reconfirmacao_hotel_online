// Teste de integração MANUAL do fluxo de resposta (createReply -> patch ->
// send), contra a conta de teste do .env. Mesmas ressalvas de
// send-mail.manual.ts: nunca roda em CI, nunca aponta para produção/hotel
// real. Recebe o graphMessageId de uma mensagem já existente na caixa de
// teste (ex. saída de send-mail.manual.ts) como argv[2].
//
// Uso: npx tsx src/lib/graph/__integration__/reply.manual.ts <graphMessageId> [internetMessageId]

import { responderHotel } from "../reply";

async function main() {
  const destinatario = process.env.MS_GRAPH_AUTHORIZED_EMAIL;
  if (!destinatario) {
    throw new Error("MS_GRAPH_AUTHORIZED_EMAIL não configurado — abortando para não enviar a lugar incerto.");
  }

  const graphMessageId = process.argv[2];
  const internetMessageId = process.argv[3] ?? null;
  if (!graphMessageId) {
    throw new Error("Informe o graphMessageId da mensagem original como argumento.");
  }

  console.log(`Respondendo à mensagem ${graphMessageId} (internetMessageId fallback: ${internetMessageId ?? "nenhum"})...`);
  const resultado = await responderHotel({
    graphMessageIdOriginal: graphMessageId,
    internetMessageIdOriginal: internetMessageId,
    destinatario,
    novoAssunto: "RE: [TESTE Milestone 7] Confirmação de reserva",
    textoUsuario: "Teste automatizado de resposta preservando thread (Milestone 7).",
  });
  console.log(JSON.stringify(resultado, null, 2));

  if (!resultado.sucesso) {
    process.exitCode = 1;
  }
}

main();
