import { NextResponse, type NextRequest } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { requisicaoAutenticadaComoCron } from "@/lib/jobs/cron-auth";
import { processarLoteDeRespostas, OPCOES_PADRAO } from "@/features/hotel-replies/process-batch";

export const maxDuration = 60;

/**
 * Disparado periodicamente pelo Vercel Cron (ver vercel.json) — execução
 * curta e idempotente, nunca um loop de longa duração (CLAUDE.md). Processa
 * um lote limitado de reservas aguardando resposta por chamada; o próximo
 * disparo continua a partir do estado atual do banco, sem depender de
 * memória entre execuções.
 */
export async function GET(request: NextRequest) {
  if (!requisicaoAutenticadaComoCron(request)) {
    return NextResponse.json({ ok: false, erro: "Não autorizado." }, { status: 401 });
  }

  const supabase = createServiceRoleClient();
  const resumo = await processarLoteDeRespostas(supabase, OPCOES_PADRAO);

  return NextResponse.json({ ok: true, resumo });
}
