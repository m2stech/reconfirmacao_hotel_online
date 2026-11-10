// Correção pontual de dado (2026-11-04): as reservas C5X24S (Hilton Orlando
// Buena Vista Palace - Disney Springs Area) e 9D15X7 (Sofitel Marrakech
// Palais Imperial & Spa) receberam resposta do hotel, mas o sistema nunca a
// registrou em `hotel_replies`. Causa raiz: `mensagemCorresponde`
// (src/lib/graph/read-mail.ts) exigia que o remetente da resposta fosse
// EXATAMENTE igual ao destinatário do envio original — mas em ambos os
// casos o hotel respondeu de um atendente específico (Ryan.Wilkinson@Hilton.com,
// Zineb.RAJA@sofitel.com) em vez do endereço genérico para o qual enviamos
// (MCOBU_RES@hilton.com, H3569@sofitel.com), apesar do conversationId e/ou
// in-reply-to baterem perfeitamente com o envio original. Essa checagem de
// igualdade estrita reprovava a mensagem antes mesmo de avaliar
// conversationId/in-reply-to. Diferente do caso XYBZ9J (2026-11-04, mesmo
// dia, bug de conversationId na query ao Graph) — este é um segundo bug
// distinto, no filtro de remetente dentro de `mensagemCorresponde`.
//
// Corrigido: a checagem de remetente agora só exclui mensagens vindas da
// nossa própria caixa (`caixaAutorizada()`), não mais exige igualdade com o
// destinatário do envio.
//
// Este script reprocessa as duas mensagens já recebidas (busca direta no
// Graph pela janela de tempo conhecida, sem depender do cron) e persiste em
// hotel_replies — mesmo fluxo de produção (interpretarResposta +
// persistirInterpretacao), rodado manualmente uma única vez para essas duas
// reservas, para não disparar o job completo (que processaria outras
// reservas pendentes fora do escopo desta correção).
//
// Uso: npx tsx -r <shim-server-only> src/lib/jobs/__integration__/reprocessar-c5x24s-9d15x7.manual.ts

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
    reservationId: "37475fe9-f5e3-4295-b08c-f66aedcb7007",
    emailSendId: "f89c3a08-9199-4354-89b1-3a5f1acd5a85",
    localizador: "C5X24S",
    envio: {
      destinatario: "MCOBU_RES@hilton.com",
      conversationId: "AAQkADIzNGYyYmFmLTYwM2QtNGE1OS04ZjJlLWM0NWYyNjY2YWY0YQAQAEQKPrOAvH9MrkcpkFTaxLU=",
      internetMessageId: "<QR3P215MB2167017E2F4356D7BD5855E6C3C5692@QR3P215MB216701.LAMP215.PROD.OUTLOOK.COM>",
      graphMessageId:
        "AAMkADIzNGYyYmFmLTYwM2QtNGE1OS04ZjJlLWM0NWYyNjY2YWY0YQBGAAAAAABZLjbJzbvXRp2m9-iDPVuCBwAeOPX7Z7e3SqFFdsG5VOFBAAAAAAEPAAAeOPX7Z7e3SqFFdsG5VOFBAACk6xp5AAA=",
      assunto: "Reservation confirmation - Hilton Orlando Buena Vista Palace - Disney Springs Area - Checkin: 22/11/2026",
      localizador: "C5X24S",
      dataEnvio: "2026-11-03T21:04:06.520248+00:00",
    },
    reserva: {
      hotel: "Hilton Orlando Buena Vista Palace - Disney Springs Area",
      localizador: "C5X24S",
      hospedes: "EDUARDO BORJA, NATALIA DINIZ, EDUARDO DINIZ BORJA",
      dataCheckin: "22/11/2026",
      dataCheckout: "30/11/2026",
      regimeAlimentar: "Apenas hospedagem",
      fornecedor: "Expedia Group Partner Solutions",
    },
  },
  {
    reservationId: "9f382cfb-7020-4595-b477-a0ca52bdf47a",
    emailSendId: "75deaae6-5ca7-4009-8ad2-d3261cc78b14",
    localizador: "9D15X7",
    envio: {
      destinatario: "H3569@sofitel.com",
      conversationId: "AAQkADIzNGYyYmFmLTYwM2QtNGE1OS04ZjJlLWM0NWYyNjY2YWY0YQAQAM7dtR7Tv_NHu3D3R-FCsgM=",
      internetMessageId: "<QR3P215MB216701EE499731DC6BE4A914F9C5692@QR3P215MB216701.LAMP215.PROD.OUTLOOK.COM>",
      graphMessageId:
        "AAMkADIzNGYyYmFmLTYwM2QtNGE1OS04ZjJlLWM0NWYyNjY2YWY0YQBGAAAAAABZLjbJzbvXRp2m9-iDPVuCBwAeOPX7Z7e3SqFFdsG5VOFBAAAAAAEPAAAeOPX7Z7e3SqFFdsG5VOFBAACk6xp8AAA=",
      assunto: "Reservation confirmation - Sofitel Marrakech Palais Imperial & Spa - Checkin: 23/11/2026",
      localizador: "9D15X7",
      dataEnvio: "2026-11-03T21:04:11.457272+00:00",
    },
    reserva: {
      hotel: "Sofitel Marrakech Palais Imperial & Spa",
      localizador: "9D15X7",
      hospedes: "ADRIENE CRISTINA RIBEIRO DE CARVALHO",
      dataCheckin: "23/11/2026",
      dataCheckout: "26/11/2026",
      regimeAlimentar: "Café da Manhã incluído",
      fornecedor: "HotelDo",
    },
  },
];

async function main() {
  const supabase = createServiceRoleClient();
  const actorId = process.env.CRON_SYSTEM_USER_ID;
  if (!actorId) throw new Error("CRON_SYSTEM_USER_ID não configurado — necessário para audit_log.actor_id (NOT NULL).");

  for (const caso of CASOS) {
    console.log(`\n=== Reserva ${caso.localizador} ===`);

    const internetIdsConhecidos = await listarInternetMessageIdsConhecidos(supabase);
    const mensagens = await buscarMensagensDaConversa(caso.envio, internetIdsConhecidos);

    console.log(`Mensagens encontradas pelo Graph (com o fix aplicado): ${mensagens.length}`);
    for (const m of mensagens) {
      console.log(`- ${m.internetMessageId} | de ${m.remetente} | recebido ${m.receivedDateTime} | assunto: ${m.subject}`);
    }

    if (mensagens.length === 0) {
      console.error(`Nenhuma mensagem encontrada para ${caso.localizador} — pulando.`);
      continue;
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

      await supabase.schema("reconfirmacao").from("audit_log").insert({
        actor_id: actorId,
        action: "correcao_captura_resposta_nao_registrada",
        entity_type: "hotel_reply",
        entity_id: persistido.id,
        metadata: {
          motivo:
            "Resposta do hotel não foi capturada pelo cron porque mensagemCorresponde (read-mail.ts) exigia remetente exatamente igual ao destinatário do envio — hotel respondeu de atendente específico em vez da caixa genérica. Corrigido em 2026-11-04 (ver CHANGELOG). Reprocessamento manual único desta reserva.",
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
    console.log(`\nStatus de auditoria após reprocessamento (${caso.localizador}):`, JSON.stringify(statusFinal, null, 2));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
