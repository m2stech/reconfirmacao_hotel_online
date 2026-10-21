// Script manual de inspeção — mostra o estado atual da reserva seed
// (localizador 9QGJZN) e seus email_sends/hotel_replies, para apoiar teste
// manual do Milestone 10. Não altera nada no banco.
//
// Uso: npx tsx src/lib/jobs/__integration__/inspecionar-seed.manual.ts

import { loadEnvFile } from "node:process";
import path from "node:path";

try {
  loadEnvFile(path.join(process.cwd(), ".env"));
} catch {
  // noop
}

import { createServiceRoleClient } from "@/lib/supabase/service-role";

async function main() {
  const supabase = createServiceRoleClient();

  const { data: reservasEncontradas, error: erroReserva } = await supabase
    .schema("reconfirmacao")
    .from("reservations")
    .select("*")
    .eq("localizador", "9QGJZN");
  console.log("Reservas:", JSON.stringify(reservasEncontradas, null, 2));
  if (erroReserva) console.error("Erro reserva:", erroReserva);

  const reserva = reservasEncontradas?.[0];
  if (!reserva) return;

  const { data: envios } = await supabase
    .schema("reconfirmacao")
    .from("email_sends")
    .select("*")
    .eq("reservation_id", reserva.id);
  console.log("\nEnvios:", JSON.stringify(envios, null, 2));

  const emailSendIds = (envios ?? []).map((e) => e.id);
  if (emailSendIds.length > 0) {
    const { data: respostas } = await supabase
      .schema("reconfirmacao")
      .from("hotel_replies")
      .select("*")
      .in("email_send_id", emailSendIds);
    console.log("\nRespostas:", JSON.stringify(respostas, null, 2));
  }

  const { data: statusAuditoria } = await supabase
    .schema("reconfirmacao")
    .from("audit_status")
    .select("*")
    .eq("reservation_id", reserva.id)
    .maybeSingle();
  console.log("\nStatus de auditoria:", JSON.stringify(statusAuditoria, null, 2));
}

main();
