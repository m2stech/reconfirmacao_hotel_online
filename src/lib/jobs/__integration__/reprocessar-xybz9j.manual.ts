// Correção pontual de dado (2026-11-04): a reserva XYBZ9J (Universal's
// Endless Summer Resort - Dockside Inn and Suites) recebeu resposta do hotel
// em 2026-11-04T00:42:11Z, mas o sistema nunca a registrou em
// `hotel_replies`. Causa raiz: `buscarMensagensDaConversa`
// (src/lib/graph/read-mail.ts) filtrava a query ao Graph por
// `conversationId` quando o envio tinha um registrado — mas a resposta veio
// de um helpdesk (Universal Orlando Guest Services, via sfdc.net) que gerou
// um conversationId novo em vez de preservar o do Exchange, apesar do header
// RFC In-Reply-To apontar corretamente para a mensagem original. O filtro
// por conversationId descartava essa mensagem antes dela sequer ser avaliada
// pelo fallback por in-reply-to/references que já existia em
// mensagemCorresponde(). Corrigido: a query agora sempre filtra só por
// janela de tempo, deixando a correlação real (conversationId OU
// in-reply-to/references OU assunto) a cargo de mensagemCorresponde().
//
// Este script reprocessa a mensagem já recebida (busca direta no Graph pela
// janela de tempo conhecida, sem depender do cron) e persiste em
// hotel_replies — mesmo fluxo de produção (interpretarResposta +
// persistirInterpretacao), rodado manualmente uma única vez para esta
// reserva, para não disparar o job completo (que processaria outras
// reservas pendentes fora do escopo desta correção).
//
// Uso: npx tsx -r ./scratch-server-only-noop.js src/lib/jobs/__integration__/reprocessar-xybz9j.manual.ts

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

const RESERVATION_ID = "b4b9c3cc-9909-4061-a025-e16d2da1f50d";
const EMAIL_SEND_ID = "def01d7a-fdf7-489f-808f-6bdaad3ce5b9";
const LOCALIZADOR = "XYBZ9J";

const envio: EnvioParaBuscaDeResposta = {
  destinatario: "guestservices@universalorlando.com",
  conversationId: "AAQkADIzNGYyYmFmLTYwM2QtNGE1OS04ZjJlLWM0NWYyNjY2YWY0YQAQACrbkh1_129Bu9xQ38WGNAI=",
  internetMessageId: "<QR3P215MB216701A87AB44DC6EF3EFB9415C5692@QR3P215MB216701.LAMP215.PROD.OUTLOOK.COM>",
  graphMessageId:
    "AAMkADIzNGYyYmFmLTYwM2QtNGE1OS04ZjJlLWM0NWYyNjY2YWY0YQBGAAAAAABZLjbJzbvXRp2m9-iDPVuCBwAeOPX7Z7e3SqFFdsG5VOFBAAAAAAEPAAAeOPX7Z7e3SqFFdsG5VOFBAACk6xp9AAA=",
  assunto: "Reservation confirmation - Universal's Endless Summer Resort - Dockside Inn and Suites - Checkin: 22/11/2026",
  localizador: LOCALIZADOR,
  dataEnvio: "2026-11-03T21:18:56.870924+00:00",
};

const reserva: DadosReservaParaIA = {
  hotel: "Universal's Endless Summer Resort - Dockside Inn and Suites",
  localizador: LOCALIZADOR,
  hospedes: "IGOR DINIZ, SELMA DINIZ, MARIA DE FATIMA FRAIHA",
  dataCheckin: "22/11/2026",
  dataCheckout: "30/11/2026",
  regimeAlimentar: "Apenas hospedagem",
  fornecedor: "Ratehawk",
};

async function main() {
  const supabase = createServiceRoleClient();

  const internetIdsConhecidos = await listarInternetMessageIdsConhecidos(supabase);
  const mensagens = await buscarMensagensDaConversa(envio, internetIdsConhecidos);

  console.log(`Mensagens encontradas pelo Graph (com o fix aplicado): ${mensagens.length}`);
  for (const m of mensagens) {
    console.log(`- ${m.internetMessageId} | de ${m.remetente} | recebido ${m.receivedDateTime} | assunto: ${m.subject}`);
  }

  if (mensagens.length === 0) {
    throw new Error("Nenhuma mensagem encontrada — verifique se o fix de read-mail.ts foi aplicado e se a janela de tempo está correta.");
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
      reserva
    );

    console.log("\nInterpretação:", JSON.stringify(resultado.analise, null, 2));
    console.log("Status de interpretação:", resultado.statusInterpretacao);

    const persistido = await persistirInterpretacao(
      supabase,
      EMAIL_SEND_ID,
      { internetMessageId: mensagem.internetMessageId, recebidoEm: mensagem.receivedDateTime ?? new Date().toISOString() },
      resultado
    );

    console.log("\nLinha gravada em hotel_replies:", JSON.stringify(persistido, null, 2));

    const actorId = process.env.CRON_SYSTEM_USER_ID;
    if (!actorId) throw new Error("CRON_SYSTEM_USER_ID não configurado — necessário para audit_log.actor_id (NOT NULL).");

    await supabase.from("audit_log").insert({
      actor_id: actorId,
      action: "correcao_captura_resposta_nao_registrada",
      entity_type: "hotel_reply",
      entity_id: persistido.id,
      metadata: {
        motivo:
          "Resposta do hotel não foi capturada pelo cron porque o filtro por conversationId na query ao Graph (read-mail.ts) descartava mensagens com conversationId diferente do original, mesmo com in-reply-to correto. Corrigido em 2026-11-04 (ver CHANGELOG). Reprocessamento manual único desta reserva.",
        reservation_id: RESERVATION_ID,
        email_send_id: EMAIL_SEND_ID,
        internet_message_id: mensagem.internetMessageId,
      },
    });

    if (resultado.statusInterpretacao === "REVISAR") {
      await notificar(supabase, {
        reservationId: RESERVATION_ID,
        tipo: "revisao_humana",
        mensagem: `Reserva ${LOCALIZADOR}: resposta do hotel precisa de revisão humana.`,
        assuntoEmail: `[Reconfirmação] Revisão humana pendente — ${LOCALIZADOR}`,
        corpoEmail: `<p>Uma resposta do hotel para a reserva <strong>${LOCALIZADOR}</strong> foi interpretada, mas precisa de revisão humana antes de ser considerada confirmada.</p>`,
        createdByEnvioOriginal: null,
      });
    }
  }

  const { data: statusFinal } = await supabase
    .schema("reconfirmacao")
    .from("audit_status")
    .select("*")
    .eq("localizador", LOCALIZADOR)
    .maybeSingle();
  console.log("\nStatus de auditoria após reprocessamento:", JSON.stringify(statusFinal, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
