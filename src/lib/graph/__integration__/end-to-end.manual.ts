// Teste de integração MANUAL de ponta a ponta do Milestone 7: cria hotel e
// reserva SINTÉTICOS (nunca dado real — PRD §7.4), aponta o e-mail do hotel
// para a conta de teste (MS_GRAPH_AUTHORIZED_EMAIL) e dispara o envio real
// via enviarReconfirmacaoInicial, gravando em reconfirmacao.email_sends.
// Limpa os dados sintéticos ao final.
//
// Uso: npx tsx src/lib/graph/__integration__/end-to-end.manual.ts

import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { enviarReconfirmacaoInicial } from "@/features/email-sends/send";

async function main() {
  const destinatarioTeste = process.env.MS_GRAPH_AUTHORIZED_EMAIL;
  if (!destinatarioTeste) {
    throw new Error("MS_GRAPH_AUTHORIZED_EMAIL não configurado — abortando.");
  }

  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!.trim(),
    process.env.SUPABASE_SERVICE_ROLE_KEY!.trim(),
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  console.log("Criando hotel sintético de teste...");
  const { data: hotel, error: erroHotel } = await supabase
    .schema("reconfirmacao")
    .from("hotels")
    .insert({
      nome: "Hotel Sintético Teste Milestone 7",
      pais: "Brasil",
      pais_fonte: "manual",
      idioma: "pt",
      confiabilidade_contato: "confirmado",
    })
    .select()
    .single();
  if (erroHotel || !hotel) throw erroHotel ?? new Error("Falha ao criar hotel sintético.");

  const { error: erroEmail } = await supabase.schema("reconfirmacao").from("hotel_emails").insert({
    hotel_id: hotel.id,
    email: destinatarioTeste,
    fonte: "manual",
    confiabilidade: "confirmado",
  });
  if (erroEmail) throw erroEmail;

  console.log("Criando reserva sintética de teste...");
  const { data: reserva, error: erroReserva } = await supabase
    .schema("reconfirmacao")
    .from("reservations")
    .insert({
      localizador: "TESTE-M7-" + Date.now(),
      hotel_id: hotel.id,
      fornecedor: "Fornecedor Sintético Teste",
      data_checkin: "2026-12-20",
      data_checkout: "2026-12-25",
      tipo_habitacao: "Standard Duplo",
      regime_alimentar: "Café da manhã",
      hospedes: [{ nome: "Hóspede Sintético Um" }, { nome: "Hóspede Sintético Dois" }],
      roomlist_arquivo: "teste-integracao-milestone-07.xlsx",
    })
    .select()
    .single();
  if (erroReserva || !reserva) throw erroReserva ?? new Error("Falha ao criar reserva sintética.");

  console.log("Disparando envio real via enviarReconfirmacaoInicial...");
  const resultado = await enviarReconfirmacaoInicial(
    supabase,
    {
      id: reserva.id,
      localizador: reserva.localizador,
      localizadorExterno: null,
      dataCheckin: reserva.data_checkin,
      dataCheckout: reserva.data_checkout,
      tipoHabitacao: reserva.tipo_habitacao,
      regimeAlimentar: reserva.regime_alimentar,
      fornecedor: reserva.fornecedor,
      hospedes: reserva.hospedes as { nome: string }[],
      hotelNome: hotel.nome,
      hotelPais: hotel.pais,
      destinatario: destinatarioTeste,
    },
    process.env.TESTE_PROFILE_ID! // ator de teste — precisa ser um id real de public.profiles (FK de audit_log/email_sends.created_by)
  ).catch((erro) => ({ sucesso: false as const, erro: String(erro), reservationId: reserva.id, emailSendId: null }));

  console.log("Resultado do envio:", JSON.stringify(resultado, null, 2));

  console.log("Conferindo registro em email_sends...");
  const { data: envios } = await supabase
    .schema("reconfirmacao")
    .from("email_sends")
    .select("*")
    .eq("reservation_id", reserva.id);
  console.log(`email_sends: ${envios?.length ?? 0} registro(s)`, JSON.stringify(envios, null, 2));

  console.log("Limpando dados sintéticos...");
  await supabase.schema("reconfirmacao").from("email_sends").delete().eq("reservation_id", reserva.id);
  await supabase.schema("reconfirmacao").from("reservations").delete().eq("id", reserva.id);
  await supabase.schema("reconfirmacao").from("hotel_emails").delete().eq("hotel_id", hotel.id);
  await supabase.schema("reconfirmacao").from("hotels").delete().eq("id", hotel.id);
  console.log("Limpeza concluída.");

  if (!resultado.sucesso) process.exitCode = 1;
}

main().catch((erro) => {
  console.error("Erro no script de integração:", erro);
  process.exitCode = 1;
});
