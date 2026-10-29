// Correção pontual de dado (2026-10-29): a resposta do MR Hotel para a
// reserva 7FX157 (hotel_replies.id f256bc35-3189-4122-9d19-2ac1fc28fb2c) foi
// interpretada antes da correção de prompt em src/lib/openai/client.ts (ver
// CHANGELOG 2026-10-29) e gravou reserva_confirmada=NAO + pendência "HCN não
// informado" por engano, apesar de o hotel ter informado o código
// 40399990202 em texto corrido ("bajo el codigo X") e o regime alimentar
// ("Desayuno incluido"). Reinterpreta essa resposta já recebida com o prompt
// corrigido e faz UPDATE na linha existente (não um novo INSERT — é a mesma
// mensagem, só a interpretação muda).
//
// Uso: npx tsx -r ./scratch-server-only-noop.js src/lib/jobs/__integration__/reinterpretar-7fx157.manual.ts

import { loadEnvFile } from "node:process";
import path from "node:path";

try {
  loadEnvFile(path.join(process.cwd(), ".env"));
} catch {
  // noop
}

import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { interpretarRespostaIA, type DadosReservaParaIA } from "@/lib/openai/client";
import { aplicarFallbackExtracao, corrigirDivergenciaDeIdentificadores, mapearConfirmacaoCorreta } from "@/features/hotel-replies/postprocess";
import { simNaoParaBooleano } from "@/features/hotel-replies/mapping";

const HOTEL_REPLY_ID = "f256bc35-3189-4122-9d19-2ac1fc28fb2c";

async function main() {
  const supabase = createServiceRoleClient();

  const { data: replyAntiga, error: erroReply } = await supabase
    .schema("reconfirmacao")
    .from("hotel_replies")
    .select("*")
    .eq("id", HOTEL_REPLY_ID)
    .single();
  if (erroReply) throw erroReply;

  console.log("Interpretação antiga:", JSON.stringify(replyAntiga, null, 2));

  const reserva: DadosReservaParaIA = {
    hotel: "MR Hotel",
    localizador: "7FX157",
    hospedes: "Otorino Otaviano Neto, Lucimara Vidal",
    dataCheckin: "04/11/2026",
    dataCheckout: "08/11/2026",
    regimeAlimentar: "Café da manhã com buffet incluido",
    fornecedor: "HotelDo",
  };

  const corpoTexto = replyAntiga.corpo_texto;

  const { analise: analiseIA, consumo } = await interpretarRespostaIA(reserva, corpoTexto);
  let analise = corrigirDivergenciaDeIdentificadores(aplicarFallbackExtracao(analiseIA, corpoTexto));
  const numeroFinal = mapearConfirmacaoCorreta(analise, reserva.hospedes);
  if (numeroFinal !== analise.numero_confirmacao_hotel) {
    analise = { ...analise, numero_confirmacao_hotel: numeroFinal };
  }

  console.log("\nNova interpretação:", JSON.stringify(analise, null, 2));

  const { data: atualizado, error: erroUpdate } = await supabase
    .schema("reconfirmacao")
    .from("hotel_replies")
    .update({
      reserva_confirmada: simNaoParaBooleano(analise.reserva_confirmada),
      regime_alimentar_confirmado: simNaoParaBooleano(analise.regime_alimentar_confirmado),
      numeros_confirmacao:
        analise.confirmacoes_multiplas.length > 0
          ? analise.confirmacoes_multiplas
          : analise.numero_confirmacao_hotel
            ? [{ hospede: "NAO_INFORMADO", numero_confirmacao: analise.numero_confirmacao_hotel }]
            : [],
      status_pagamento: analise.status_pagamento,
      divergencias: analise.divergencias.length > 0 ? analise.divergencias.join("; ") : null,
      pendencias: analise.pendencia,
      resumo: analise.resumo_resposta,
      confianca: String(analise.confianca),
      openai_tokens_input: consumo.inputTokens || null,
      openai_tokens_output: consumo.outputTokens || null,
      openai_custo_usd: consumo.custoUsd || null,
    })
    .eq("id", HOTEL_REPLY_ID)
    .select()
    .single();
  if (erroUpdate) throw erroUpdate;

  console.log("\nLinha atualizada:", JSON.stringify(atualizado, null, 2));

  const actorId = process.env.CRON_SYSTEM_USER_ID;
  if (!actorId) throw new Error("CRON_SYSTEM_USER_ID não configurado — necessário para audit_log.actor_id (NOT NULL).");

  await supabase.from("audit_log").insert({
    actor_id: actorId,
    action: "correcao_interpretacao_ia",
    entity_type: "hotel_reply",
    entity_id: HOTEL_REPLY_ID,
    metadata: {
      motivo: "Reinterpretação pós-correção de prompt (CHANGELOG 2026-10-29) — reserva 7FX157",
      reserva_confirmada_antes: replyAntiga.reserva_confirmada,
      reserva_confirmada_depois: simNaoParaBooleano(analise.reserva_confirmada),
    },
  });

  const { data: statusFinal } = await supabase
    .schema("reconfirmacao")
    .from("audit_status")
    .select("*")
    .eq("localizador", "7FX157")
    .maybeSingle();
  console.log("\nStatus de auditoria após correção:", JSON.stringify(statusFinal, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
