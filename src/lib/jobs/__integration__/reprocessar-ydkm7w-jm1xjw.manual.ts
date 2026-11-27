// Correção pontual de dado (2026-11-27): as reservas YDKM7W (Vila Galé
// Salvador) e JM1XJW (HF Fenix Garden) foram reconfirmadas pela Hotelbeds
// (broker/fornecedor), mas o sistema nunca registrou isso — reportado pelo
// usuário, que via a resposta na própria caixa `produtos1@bvgroup.com.br`
// sem nenhum reflexo no dashboard.
//
// Causa raiz (corrigida nesta mesma sessão, ver CHANGELOG 2026-11-27):
// `listarReservasAguardandoResposta`/`processarLoteDeRespostas` só buscavam
// resposta na conversa do e-mail enviado ao hotel (`email_sends`) — nunca na
// conversa do e-mail enviado ao broker via "Enviar para Broker"
// (`broker_sends`), que é onde a Hotelbeds de fato respondeu. Corrigido
// incluindo o último envio ao broker como conversa candidata adicional.
//
// Este script reprocessa as duas mensagens já recebidas (busca direta no
// Graph pela conversa do broker, com o fix já aplicado) e persiste em
// hotel_replies — mesmo fluxo de produção (interpretarResposta +
// persistirInterpretacao), rodado manualmente uma única vez.
//
// Uso: npx tsx -r ./scratch-server-only-noop.js src/lib/jobs/__integration__/reprocessar-ydkm7w-jm1xjw.manual.ts

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
  envioBroker: EnvioParaBuscaDeResposta;
  reserva: DadosReservaParaIA;
};

const CASOS: Caso[] = [
  {
    reservationId: "029abf42-6d2d-4b72-be17-efbd3b96300c",
    emailSendId: "f377af0c-dc5d-49aa-a76c-0c951497c466", // último email_send ao hotel (reenvio/cobrança 1/3) — hotel_replies continua referenciando este
    localizador: "YDKM7W",
    envioBroker: {
      destinatario: "americas.brazilian@hotelbeds.com",
      conversationId: "AAQkADIzNGYyYmFmLTYwM2QtNGE1OS04ZjJlLWM0NWYyNjY2YWY0YQAQAMPScrz3yEpOgX714J86oEI=",
      internetMessageId: "<QR3P215MB216701F9975EF44D7AD74D879CC5422@QR3P215MB216701.LAMP215.PROD.OUTLOOK.COM>",
      graphMessageId:
        "AAMkADIzNGYyYmFmLTYwM2QtNGE1OS04ZjJlLWM0NWYyNjY2YWY0YQBGAAAAAABZLjbJzbvXRp2m9-iDPVuCBwAeOPX7Z7e3SqFFdsG5VOFBAAAAAAEPAAAeOPX7Z7e3SqFFdsG5VOFBAACzfiVLAAA=",
      assunto: "RE: Confirmação de reserva - Vila Galé Salvador - Checkin: 01/12/2026 - cobrança 1/3",
      localizador: "YDKM7W",
      dataEnvio: "2026-11-26T18:55:20.858747+00:00",
    },
    reserva: {
      hotel: "Vila Galé Salvador",
      localizador: "YDKM7W",
      hospedes: "Hóspede 1, Hóspede 2", // anonimizado; eram os 2 hóspedes reais da reserva
      dataCheckin: "01/12/2026",
      dataCheckout: "03/12/2026",
      regimeAlimentar: "ROOM ONLY",
      fornecedor: "Hotelbeds Hoteis",
    },
  },
  {
    reservationId: "86232597-3aef-4bf1-b02d-417154e3a4fc",
    emailSendId: "d81e77e1-fe0e-4ab2-a2a5-e903ea194d9c", // único email_send ao hotel — hotel_replies continua referenciando este
    localizador: "JM1XJW",
    envioBroker: {
      destinatario: "americas.brazilian@hotelbeds.com",
      conversationId: "AAQkADIzNGYyYmFmLTYwM2QtNGE1OS04ZjJlLWM0NWYyNjY2YWY0YQAQAMgBC4rUUrNNq5yldp4JkKU=",
      internetMessageId: "<QR3P215MB2167018723EDD2380C0E6AB414C5422@QR3P215MB216701.LAMP215.PROD.OUTLOOK.COM>",
      graphMessageId:
        "AAMkADIzNGYyYmFmLTYwM2QtNGE1OS04ZjJlLWM0NWYyNjY2YWY0YQBGAAAAAABZLjbJzbvXRp2m9-iDPVuCBwAeOPX7Z7e3SqFFdsG5VOFBAAAAAAEPAAAeOPX7Z7e3SqFFdsG5VOFBAACzfiVMAAA=",
      assunto: "Confirmação de reserva - HF Fenix Garden - Checkin: 06/12/2026",
      localizador: "JM1XJW",
      dataEnvio: "2026-11-26T18:58:02.509994+00:00",
    },
    reserva: {
      hotel: "HF Fenix Garden",
      localizador: "JM1XJW",
      hospedes: "Hóspede 1, Hóspede 2", // anonimizado; eram os 2 hóspedes reais da reserva
      dataCheckin: "06/12/2026",
      dataCheckout: "09/12/2026",
      regimeAlimentar: "ROOM ONLY",
      fornecedor: "Hotelbeds Hoteis",
    },
  },
];

async function processarCaso(supabase: ReturnType<typeof createServiceRoleClient>, caso: Caso) {
  console.log(`\n=== ${caso.localizador} ===`);

  const internetIdsConhecidos = await listarInternetMessageIdsConhecidos(supabase);
  const mensagens = await buscarMensagensDaConversa(caso.envioBroker, internetIdsConhecidos);

  console.log(`Mensagens encontradas pelo Graph na conversa do broker (com o fix aplicado): ${mensagens.length}`);
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
          "Resposta do broker (Hotelbeds) não foi capturada pelo cron porque o job de leitura só buscava na conversa do e-mail enviado ao hotel, nunca na conversa do e-mail enviado ao broker via 'Enviar para Broker' (broker_sends). Corrigido em 2026-11-27 incluindo o último envio ao broker como conversa candidata adicional. Reprocessamento manual único desta reserva.",
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
