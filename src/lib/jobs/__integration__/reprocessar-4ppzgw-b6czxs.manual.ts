// Correção pontual de dado (2026-11-10): as reservas 4PPZGW (Grand Palladium
// Imbassaí Resort & Spa) e B6CZXS (NH Collection Amsterdam Barbizon Palace)
// receberam resposta real do hotel, mas o sistema nunca registrou nenhuma
// delas em `hotel_replies` — reportado pelo usuário (consultora Evelyn
// Travassos), que via as respostas na própria caixa `produtos1@bvgroup.com.br`
// sem nenhum reflexo no dashboard.
//
// Causa raiz, diferente dos dois casos de threading quebrado já corrigidos
// em 2026-11-04: `buscarMensagensDaConversa` (src/lib/graph/read-mail.ts)
// buscava só a primeira página de `$top=50` mensagens da janela de tempo,
// sem seguir `@odata.nextLink`. Com o volume de tráfego real da caixa
// (múltiplas reservas sendo enviadas/respondidas por dia), as duas respostas
// caíram fora dessa primeira página — `mensagemCorresponde()` nunca chegou
// a avaliá-las, mesmo com correlação válida em ambos os casos (4PPZGW: mesmo
// conversationId do envio; B6CZXS: conversationId novo de um sistema de
// ticket da Minor Hotels, mas assunto contém o assunto original). Corrigido
// paginando até esgotar @odata.nextLink (teto de segurança de 20 páginas).
//
// Este script reprocessa as duas mensagens já recebidas (busca direta no
// Graph com o fix aplicado) e persiste em hotel_replies — mesmo fluxo de
// produção (interpretarResposta + persistirInterpretacao), rodado
// manualmente uma única vez, para não disparar o job completo.
//
// Uso: npx tsx -r ./scratch-server-only-noop.js src/lib/jobs/__integration__/reprocessar-4ppzgw-b6czxs.manual.ts

import { loadEnvFile } from "node:process";
import path from "node:path";

try {
  loadEnvFile(path.join(process.cwd(), ".env"));
} catch {
  // noop
}

import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { buscarMensagensDaConversa, type EnvioParaBuscaDeResposta } from "@/lib/graph/read-mail";
import { interpretarResposta } from "@/features/hotel-replies/interpret";
import { persistirInterpretacao } from "@/features/hotel-replies/persist";
import { jaRegistrada, listarInternetMessageIdsConhecidos } from "@/features/hotel-replies/queries";
import { notificar } from "@/features/notifications/notify";
import { htmlParaTexto } from "@/features/hotel-replies/text";
import type { DadosReservaParaIA } from "@/lib/openai/client";

type Caso = {
  reservationId: string;
  emailSendId: string;
  localizador: string;
  envio: EnvioParaBuscaDeResposta;
  reserva: DadosReservaParaIA;
};

const CASOS: Caso[] = [
  {
    reservationId: "7f6f691a-a4c6-450d-8dbf-9fec33c8e1fd",
    emailSendId: "f79f6254-135d-45cf-a72a-cca6d35d302a",
    localizador: "4PPZGW",
    envio: {
      destinatario: "callcenter.america@palladiumhotelgroup.com",
      conversationId: "AAQkADIzNGYyYmFmLTYwM2QtNGE1OS04ZjJlLWM0NWYyNjY2YWY0YQAQAPf1LdiiNRZMgXs-qHxP1A4=",
      internetMessageId: "<QR3P215MB2167011FD4C6B39F959A96E70DC5732@QR3P215MB216701.LAMP215.PROD.OUTLOOK.COM>",
      graphMessageId:
        "AAMkADIzNGYyYmFmLTYwM2QtNGE1OS04ZjJlLWM0NWYyNjY2YWY0YQBGAAAAAABZLjbJzbvXRp2m9-iDPVuCBwAeOPX7Z7e3SqFFdsG5VOFBAAAAAAEPAAAeOPX7Z7e3SqFFdsG5VOFBAACo2Q7iAAA=",
      assunto: "Reservation confirmation - Grand Palladium Imbassaí Resort & Spa - All Inclusive - Checkin: 18/11/2026",
      localizador: "4PPZGW",
      dataEnvio: "2026-11-09T18:47:04.549234+00:00",
    },
    reserva: {
      hotel: "Grand Palladium Imbassaí Resort & Spa - All Inclusive",
      localizador: "4PPZGW",
      hospedes: "Hóspede 1, Hóspede 2, Hóspede 3", // anonimizado; eram 3 hóspedes reais da reserva
      dataCheckin: "18/11/2026",
      dataCheckout: "22/11/2026",
      regimeAlimentar: "All Inclusive",
      fornecedor: "HotelDo",
    },
  },
  {
    reservationId: "ffb3bce2-f777-475a-a7a5-623042bfd8b1",
    emailSendId: "7acfc322-ee46-4062-9587-32b01a5b56ec",
    localizador: "B6CZXS",
    envio: {
      destinatario: "groups.nhcollectionbarbizonpalace@nh-hotels.com",
      conversationId: "AAQkADIzNGYyYmFmLTYwM2QtNGE1OS04ZjJlLWM0NWYyNjY2YWY0YQAQADcAf-T3KChBqGbVKdp17-8=",
      internetMessageId: "<QR3P215MB216701704C90312305DDBD4B6EC5732@QR3P215MB216701.LAMP215.PROD.OUTLOOK.COM>",
      graphMessageId:
        "AAMkADIzNGYyYmFmLTYwM2QtNGE1OS04ZjJlLWM0NWYyNjY2YWY0YQBGAAAAAABZLjbJzbvXRp2m9-iDPVuCBwAeOPX7Z7e3SqFFdsG5VOFBAAAAAAEPAAAeOPX7Z7e3SqFFdsG5VOFBAACo2Q7aAAA=",
      assunto: "Reservation confirmation - NH Collection Amsterdam Barbizon Palace - Checkin: 19/11/2026",
      localizador: "B6CZXS",
      dataEnvio: "2026-11-09T18:16:05.081585+00:00",
    },
    reserva: {
      hotel: "NH Collection Amsterdam Barbizon Palace",
      localizador: "B6CZXS",
      hospedes: "Hóspede 1, Hóspede 2", // anonimizado; eram 2 hóspedes reais da reserva
      dataCheckin: "19/11/2026",
      dataCheckout: "20/11/2026",
      regimeAlimentar: "Café da Manhã incluído",
      fornecedor: "HotelDo",
    },
  },
];

async function processarCaso(supabase: ReturnType<typeof createServiceRoleClient>, caso: Caso) {
  console.log(`\n=== ${caso.localizador} ===`);

  const internetIdsConhecidos = await listarInternetMessageIdsConhecidos(supabase);
  const mensagens = await buscarMensagensDaConversa(caso.envio, internetIdsConhecidos);

  console.log(`Mensagens encontradas pelo Graph (com o fix de paginação aplicado): ${mensagens.length}`);
  for (const m of mensagens) {
    console.log(`- ${m.internetMessageId} | de ${m.remetente} | recebido ${m.receivedDateTime} | assunto: ${m.subject}`);
  }

  if (mensagens.length === 0) {
    console.warn(`Nenhuma mensagem encontrada para ${caso.localizador} — pulando.`);
    return;
  }

  for (const mensagem of mensagens) {
    if (!mensagem.internetMessageId) continue;

    if (await jaRegistrada(supabase, mensagem.internetMessageId)) {
      console.log(`Mensagem ${mensagem.internetMessageId} já registrada em hotel_replies — pulando.`);
      continue;
    }

    const resultado = await interpretarResposta(
      {
        assunto: mensagem.subject,
        remetente: mensagem.remetente,
        cabecalhoAutoSubmitted: mensagem.cabecalhoAutoSubmitted,
        cabecalhoPrecedence: mensagem.cabecalhoPrecedence,
        corpoHtmlOuPreview: mensagem.bodyContent ?? htmlParaTexto(mensagem.bodyPreview),
      },
      caso.reserva
    );

    console.log("\nInterpretação:", JSON.stringify(resultado.analise, null, 2));
    console.log("Status de interpretação:", resultado.statusInterpretacao);

    const persistido = await persistirInterpretacao(
      supabase,
      caso.emailSendId,
      { internetMessageId: mensagem.internetMessageId, recebidoEm: mensagem.receivedDateTime ?? new Date().toISOString() },
      resultado
    );

    console.log("\nLinha gravada em hotel_replies:", JSON.stringify(persistido, null, 2));

    const actorId = process.env.CRON_SYSTEM_USER_ID;
    if (!actorId) throw new Error("CRON_SYSTEM_USER_ID não configurado — necessário para audit_log.actor_id (NOT NULL).");

    await supabase.schema("reconfirmacao").from("audit_log").insert({
      actor_id: actorId,
      action: "correcao_captura_resposta_nao_registrada",
      entity_type: "hotel_reply",
      entity_id: persistido.id,
      metadata: {
        motivo:
          "Resposta do hotel não foi capturada pelo cron porque buscarMensagensDaConversa (read-mail.ts) só buscava a 1ª página ($top=50) sem seguir @odata.nextLink — a resposta real ficou em página seguinte. Corrigido em 2026-11-10 adicionando paginação. Reprocessamento manual único desta reserva.",
        reservation_id: caso.reservationId,
        email_send_id: caso.emailSendId,
        internet_message_id: mensagem.internetMessageId,
      },
    });

    if (resultado.statusInterpretacao === "REVISAR") {
      await notificar(supabase, {
        reservationId: caso.reservationId,
        tipo: "revisao_humana",
        mensagem: `Reserva ${caso.localizador}: resposta do hotel precisa de revisão humana.`,
        assuntoEmail: `[Reconfirmação] Revisão humana pendente — ${caso.localizador}`,
        corpoEmail: `<p>Uma resposta do hotel para a reserva <strong>${caso.localizador}</strong> foi interpretada, mas precisa de revisão humana antes de ser considerada confirmada.</p>`,
        createdByEnvioOriginal: null,
      });
    }
  }

  const { data: statusFinal } = await supabase
    .schema("reconfirmacao")
    .from("audit_status")
    .select("*")
    .eq("localizador", caso.localizador)
    .maybeSingle();
  console.log("\nStatus de auditoria após reprocessamento:", JSON.stringify(statusFinal, null, 2));
}

async function main() {
  const supabase = createServiceRoleClient();
  for (const caso of CASOS) {
    await processarCaso(supabase, caso);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
