import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { processarLoteDeRespostas, OPCOES_PADRAO } from "@/features/hotel-replies/process-batch";

export const maxDuration = 60;

// Cooldown simples para evitar cliques repetidos gerando chamadas de IA
// desnecessárias (PRD §12.5) — em memória da instância, suficiente para
// desencorajar clique acidental duplo; não é uma garantia distribuída (não
// crítico: o circuit breaker em processarLoteDeRespostas já limita o custo
// máximo de qualquer disparo individual, automático ou manual).
const COOLDOWN_MS = 30_000;
let ultimoDisparoEm = 0;

/**
 * Disparo manual do mesmo processamento do Cron Job (ver
 * src/app/api/jobs/ler-respostas/route.ts) — para o consultor forçar a
 * checagem de respostas na hora, sem depender só do cron 1x/dia (limite do
 * plano Vercel Hobby, ver PLAN.md Milestone 10). Autenticado por sessão
 * (qualquer usuário autenticado ativo), não por CRON_SECRET.
 */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, erro: "Não autenticado." }, { status: 401 });
  }

  const agora = Date.now();
  if (agora - ultimoDisparoEm < COOLDOWN_MS) {
    const restanteMs = COOLDOWN_MS - (agora - ultimoDisparoEm);
    return NextResponse.json(
      { ok: false, erro: `Aguarde ${Math.ceil(restanteMs / 1000)}s antes de verificar novamente.` },
      { status: 429 }
    );
  }
  ultimoDisparoEm = agora;

  const supabaseServiceRole = createServiceRoleClient();
  const resumo = await processarLoteDeRespostas(supabaseServiceRole, OPCOES_PADRAO);

  return NextResponse.json({ ok: true, resumo });
}
