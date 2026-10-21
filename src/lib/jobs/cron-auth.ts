import "server-only";

// Autenticação de Vercel Cron Jobs — a Vercel chama a rota com
// `Authorization: Bearer <CRON_SECRET>` (https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs).
// Sem isso, qualquer rota de job ficaria acessível publicamente sem nenhuma
// autenticação de sessão (não há usuário logado num disparo de Cron).

import type { NextRequest } from "next/server";

export function requisicaoAutenticadaComoCron(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const cabecalho = request.headers.get("authorization");
  return cabecalho === `Bearer ${secret}`;
}
