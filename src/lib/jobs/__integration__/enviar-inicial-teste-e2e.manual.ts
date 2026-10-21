// Envia o e-mail de reconfirmação inicial de verdade para a reserva seed
// (9QGJZN, Hotel Fictício Praia Azul), gravando em reconfirmacao.email_sends
// — necessário para o teste ponta a ponta do Milestone 10 (job de leitura
// de respostas), que precisa de uma conversa real já registrada para
// buscar no Graph. Destinatário é sempre o e-mail de revisão fixo abaixo,
// nunca lido do .env (nunca aponta a hotel real — CLAUDE.md/PRD §7.1).
//
// Uso: npx tsx src/lib/jobs/__integration__/enviar-inicial-teste-e2e.manual.ts

import { loadEnvFile } from "node:process";
import path from "node:path";

try {
  loadEnvFile(path.join(process.cwd(), ".env"));
} catch {
  // noop
}

import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { enviarReconfirmacaoInicial } from "@/features/email-sends/send";

const DESTINATARIO_TESTE = "mauricio@m2stech.tur.br";
const RESERVATION_ID_SEED = "00000000-0000-0000-0000-000000000002";
const SYSTEM_USER_ID = process.env.CRON_SYSTEM_USER_ID;

async function main() {
  if (!SYSTEM_USER_ID) throw new Error("CRON_SYSTEM_USER_ID não configurado no .env.");

  const supabase = createServiceRoleClient();

  const resultado = await enviarReconfirmacaoInicial(
    supabase,
    {
      id: RESERVATION_ID_SEED,
      localizador: "9QGJZN",
      localizadorExterno: null,
      dataCheckin: "2026-12-10",
      dataCheckout: "2026-12-15",
      tipoHabitacao: "Standard Duplo",
      regimeAlimentar: "Café da manhã",
      fornecedor: "Fornecedor Fictício Turismo",
      hospedes: [{ nome: "Hóspede Fictício Um" }, { nome: "Hóspede Fictício Dois" }],
      hotelNome: "Hotel Fictício Praia Azul",
      hotelPais: "Brasil",
      destinatario: DESTINATARIO_TESTE,
    },
    SYSTEM_USER_ID
  );

  console.log(JSON.stringify(resultado, null, 2));
}

main().catch((erro) => {
  console.error(JSON.stringify(erro, null, 2));
  process.exitCode = 1;
});
