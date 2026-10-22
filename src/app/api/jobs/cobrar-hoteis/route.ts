import { NextResponse, type NextRequest } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { requisicaoAutenticadaComoCron } from "@/lib/jobs/cron-auth";
import { processarLoteDeCobranca, OPCOES_COBRANCA_PADRAO } from "@/features/hotel-replies/collection";

export const maxDuration = 60;

/**
 * Disparado 1x/dia pelo Vercel Cron (ver vercel.json — limite do plano
 * Hobby, mesma restrição do Milestone 10). Cobra automaticamente hotéis
 * sem resposta há 24h+ desde o último contato, até 3 tentativas por
 * reserva; na 3ª tentativa esgotada, notifica em vez de reenviar
 * (Milestone 11 — decisão fechada com o usuário, sem SLA configurável nem
 * escalonamento a broker por ora).
 */
export async function GET(request: NextRequest) {
  if (!requisicaoAutenticadaComoCron(request)) {
    return NextResponse.json({ ok: false, erro: "Não autorizado." }, { status: 401 });
  }

  const supabase = createServiceRoleClient();
  const resumo = await processarLoteDeCobranca(supabase, OPCOES_COBRANCA_PADRAO);

  return NextResponse.json({ ok: true, resumo });
}
