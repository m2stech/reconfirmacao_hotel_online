// Teste de integração MANUAL de ponta a ponta do Milestone 11: cria hotel e
// reserva SINTÉTICOS (nunca dado real — PRD §7.4), aponta o e-mail do hotel
// para a conta de teste (MS_GRAPH_AUTHORIZED_EMAIL) e exercita o fluxo real
// de cobrança automática: envio inicial -> 1ª cobrança (reenvio real,
// incrementa cobranca_tentativas) -> 3ª tentativa esgotada (notificação
// sla_esgotado + e-mail real para NOTIFICACAO_EQUIPE_EMAIL, sem reenviar).
// Limpa os dados sintéticos ao final.
//
// Uso: npx tsx --env-file=.env src/features/hotel-replies/__integration__/collection.manual.ts
// (precisa também de TESTE_PROFILE_ID=<uuid de public.profiles> no ambiente,
// e de um shim de módulo para "server-only" — ver nota de execução no PLAN.md
// Milestone 11, já que este pacote só funciona dentro do bundler do Next.)
//
// Cuidado: --env-file lê o .env uma única vez, no início do processo. Não
// edite o .env enquanto este script estiver rodando — um incidente real
// nesta sessão capturou MS_GRAPH_AUTHORIZED_EMAIL=produtos1@bvgroup.com.br
// (caixa de PRODUÇÃO) porque o arquivo foi editado no meio da execução.

import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { enviarReconfirmacaoInicial } from "@/features/email-sends/send";
import { processarLoteDeCobranca } from "@/features/hotel-replies/collection";
import { listarRecentes } from "@/features/notifications/queries";

async function main() {
  const destinatarioTeste = process.env.MS_GRAPH_AUTHORIZED_EMAIL;
  if (!destinatarioTeste) throw new Error("MS_GRAPH_AUTHORIZED_EMAIL não configurado — abortando.");
  if (!process.env.NOTIFICACAO_EQUIPE_EMAIL) throw new Error("NOTIFICACAO_EQUIPE_EMAIL não configurado — abortando.");
  if (!process.env.TESTE_PROFILE_ID) throw new Error("TESTE_PROFILE_ID não configurado — abortando.");

  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!.trim(),
    process.env.SUPABASE_SERVICE_ROLE_KEY!.trim(),
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  console.log("Criando hotel sintético de teste...");
  const { data: hotel, error: erroHotel } = await supabase
    .schema("reconfirmacao")
    .from("hotels")
    .insert({ nome: "Hotel Sintético Teste Milestone 11", pais: "Brasil", pais_fonte: "manual", idioma: "pt", confiabilidade_contato: "confirmado" })
    .select()
    .single();
  if (erroHotel || !hotel) throw erroHotel ?? new Error("Falha ao criar hotel sintético.");

  const { error: erroEmail } = await supabase
    .schema("reconfirmacao")
    .from("hotel_emails")
    .insert({ hotel_id: hotel.id, email: destinatarioTeste, fonte: "manual", confiabilidade: "confirmado" });
  if (erroEmail) throw erroEmail;

  console.log("Criando reserva sintética de teste...");
  const { data: reserva, error: erroReserva } = await supabase
    .schema("reconfirmacao")
    .from("reservations")
    .insert({
      localizador: "TESTE-M11-" + Date.now(),
      hotel_id: hotel.id,
      fornecedor: "Fornecedor Sintético Teste",
      data_checkin: "2026-12-20",
      data_checkout: "2026-12-25",
      tipo_habitacao: "Standard Duplo",
      regime_alimentar: "Café da manhã",
      hospedes: [{ nome: "Hóspede Sintético Um" }],
      roomlist_arquivo: "teste-integracao-milestone-11.xlsx",
    })
    .select()
    .single();
  if (erroReserva || !reserva) throw erroReserva ?? new Error("Falha ao criar reserva sintética.");

  async function limpar() {
    console.log("Limpando dados sintéticos...");
    await supabase.schema("reconfirmacao").from("notificacoes").delete().eq("reservation_id", reserva!.id);
    await supabase.schema("reconfirmacao").from("email_sends").delete().eq("reservation_id", reserva!.id);
    await supabase.schema("reconfirmacao").from("reservations").delete().eq("id", reserva!.id);
    await supabase.schema("reconfirmacao").from("hotel_emails").delete().eq("hotel_id", hotel!.id);
    await supabase.schema("reconfirmacao").from("hotels").delete().eq("id", hotel!.id);
    console.log("Limpeza concluída.");
  }

  try {
    console.log("1) Envio inicial (real, conta de teste)...");
    const resultadoInicial = await enviarReconfirmacaoInicial(
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
      process.env.TESTE_PROFILE_ID
    );
    console.log("Resultado envio inicial:", JSON.stringify(resultadoInicial));
    if (!resultadoInicial.sucesso) throw new Error("Envio inicial falhou — abortando teste de cobrança.");

    console.log("2) Retroagindo cobranca_ultima_em para simular 24h+ decorridas...");
    const dataPassado = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    const { data: envioAtualizado, error: erroAtualizarEnvio } = await supabase
      .schema("reconfirmacao")
      .from("email_sends")
      .update({ created_at: dataPassado })
      .eq("id", resultadoInicial.emailSendId)
      .select();
    console.log("Update email_sends.created_at:", JSON.stringify({ erroAtualizarEnvio, envioAtualizado }));

    const { data: statusDebug } = await supabase
      .schema("reconfirmacao")
      .from("audit_status")
      .select("reservation_id, status, cobranca_tentativas, cobranca_ultima_em, last_email_send_at, last_email_send_id")
      .eq("reservation_id", reserva.id)
      .maybeSingle();
    console.log("audit_status da reserva antes da cobrança:", JSON.stringify(statusDebug));

    console.log("3) Disparando processarLoteDeCobranca (1ª cobrança esperada)...");
    const resumo1 = await processarLoteDeCobranca(supabase, { limiteReservas: 10 });
    console.log("Resumo cobrança 1:", JSON.stringify(resumo1));
    if (resumo1.cobrancasEnviadas !== 1) throw new Error(`Esperava 1 cobrança enviada, obteve ${resumo1.cobrancasEnviadas}.`);

    const { data: reservaAposCobranca1 } = await supabase
      .schema("reconfirmacao")
      .from("reservations")
      .select("cobranca_tentativas, cobranca_ultima_em")
      .eq("id", reserva.id)
      .single();
    console.log("Reserva após 1ª cobrança:", JSON.stringify(reservaAposCobranca1));
    if (reservaAposCobranca1?.cobranca_tentativas !== 1) throw new Error("cobranca_tentativas não incrementou para 1.");

    console.log("4) Forçando estado de 3 tentativas já esgotadas...");
    const dataAindaMaisPassado = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    await supabase
      .schema("reconfirmacao")
      .from("reservations")
      .update({ cobranca_tentativas: 3, cobranca_ultima_em: dataAindaMaisPassado })
      .eq("id", reserva.id);

    console.log("5) Disparando processarLoteDeCobranca de novo (SLA esgotado esperado, sem reenviar)...");
    const resumo2 = await processarLoteDeCobranca(supabase, { limiteReservas: 10 });
    console.log("Resumo cobrança 2:", JSON.stringify(resumo2));
    if (resumo2.slaEsgotado !== 1) throw new Error(`Esperava 1 SLA esgotado, obteve ${resumo2.slaEsgotado}.`);
    if (resumo2.cobrancasEnviadas !== 0) throw new Error("Não deveria ter reenviado após SLA esgotado.");

    console.log("6) Confirmando notificação sla_esgotado registrada (in-app)...");
    const notificacoes = await listarRecentes(supabase, 10);
    const notificacaoEsgotada = notificacoes.find((n) => n.reservation_id === reserva.id && n.tipo === "sla_esgotado");
    if (!notificacaoEsgotada) throw new Error("Notificação sla_esgotado não encontrada em reconfirmacao.notificacoes.");
    console.log("Notificação encontrada:", JSON.stringify(notificacaoEsgotada));
    console.log("E-mail de notificação (melhor esforço) deve ter chegado em", process.env.NOTIFICACAO_EQUIPE_EMAIL, "— confirme manualmente na caixa de teste.");

    console.log("TESTE DE INTEGRAÇÃO CONCLUÍDO COM SUCESSO.");
  } finally {
    await limpar();
  }
}

main().catch((erro) => {
  console.error("Erro no script de integração:", erro);
  process.exitCode = 1;
});
