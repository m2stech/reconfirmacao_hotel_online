import "server-only";

// Orquestra os dois canais de notificação do Milestone 11 (PRD §4.1 item 5):
// registro in-app (`reconfirmacao.notificacoes`) + e-mail via Graph. Nunca
// lança por falha de e-mail — notificação in-app é o canal garantido; falha
// de Graph aqui não pode travar o job/fluxo que a disparou.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { enviarEmail } from "@/lib/graph/send-mail";
import { criarNotificacao } from "./queries";

type TypedClient = SupabaseClient<Database>;
type NotificacaoTipo = Database["reconfirmacao"]["Enums"]["notificacao_tipo"];

function emailEquipe(): string | null {
  return process.env.NOTIFICACAO_EQUIPE_EMAIL ?? null;
}

async function buscarEmailResponsavel(supabase: TypedClient, createdBy: string | null): Promise<string | null> {
  if (!createdBy) return null;
  const { data, error } = await supabase.from("profiles").select("email").eq("id", createdBy).maybeSingle();
  if (error || !data) return null;
  return data.email;
}

/**
 * Notifica revisão humana pendente, erro de envio ou SLA de cobrança
 * esgotado: grava em `notificacoes` (sempre) e envia e-mail (melhor esforço)
 * para o responsável pelo envio original + e-mail de equipe (`.env`).
 */
export async function notificar(
  supabase: TypedClient,
  params: {
    reservationId: string;
    tipo: NotificacaoTipo;
    mensagem: string;
    assuntoEmail: string;
    corpoEmail: string;
    createdByEnvioOriginal: string | null;
  }
): Promise<void> {
  await criarNotificacao(supabase, {
    reservation_id: params.reservationId,
    tipo: params.tipo,
    mensagem: params.mensagem,
  });

  const destinatarios = new Set<string>();
  const equipe = emailEquipe();
  if (equipe) destinatarios.add(equipe);
  const responsavel = await buscarEmailResponsavel(supabase, params.createdByEnvioOriginal);
  if (responsavel) destinatarios.add(responsavel);

  for (const destinatario of destinatarios) {
    try {
      await enviarEmail({
        destinatario,
        assunto: params.assuntoEmail,
        corpoHtmlComAssinatura: params.corpoEmail,
      });
    } catch {
      // Falha de e-mail não pode travar o job/fluxo que chamou notificar() —
      // o registro in-app já foi gravado, é o canal garantido.
    }
  }
}
