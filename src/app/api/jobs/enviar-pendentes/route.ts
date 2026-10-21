import { NextResponse, type NextRequest } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { requisicaoAutenticadaComoCron } from "@/lib/jobs/cron-auth";
import { enviarReconfirmacoesPendentes } from "@/features/email-sends/batch-send";

export const maxDuration = 60;

const LIMITE_RESERVAS_POR_DISPARO = 25;

/**
 * Disparado periodicamente pelo Vercel Cron (ver vercel.json). Cobre
 * reservas gravadas sem envio (ex: hotel sem e-mail confirmado no momento
 * do upload, confirmado depois em /hoteis) — o envio inicial no fluxo
 * síncrono de confirmação de importação (Milestone 7/8) continua existindo
 * e cobre o caso comum; este job é a rede de segurança para o que ficou
 * pendente. `CRON_SYSTEM_USER_ID` identifica em audit_log que a ação foi
 * automática (usuário de sistema fixo), não de um consultor — necessário
 * porque `public.audit_log.actor_id` (schema do TripQuote) é NOT NULL.
 */
export async function GET(request: NextRequest) {
  if (!requisicaoAutenticadaComoCron(request)) {
    return NextResponse.json({ ok: false, erro: "Não autorizado." }, { status: 401 });
  }

  const systemUserId = process.env.CRON_SYSTEM_USER_ID;
  if (!systemUserId) {
    return NextResponse.json({ ok: false, erro: "CRON_SYSTEM_USER_ID não configurado." }, { status: 500 });
  }

  const supabase = createServiceRoleClient();
  const resumo = await enviarReconfirmacoesPendentes(supabase, systemUserId, LIMITE_RESERVAS_POR_DISPARO);

  return NextResponse.json({ ok: true, resumo });
}
