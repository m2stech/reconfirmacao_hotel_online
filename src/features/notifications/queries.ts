import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

type TypedClient = SupabaseClient<Database>;
type NotificacaoInsert = Database["reconfirmacao"]["Tables"]["notificacoes"]["Insert"];
type NotificacaoRow = Database["reconfirmacao"]["Tables"]["notificacoes"]["Row"];

/**
 * Cria uma notificação in-app (Milestone 11). Sempre via service role — a
 * policy de INSERT de `reconfirmacao.notificacoes` é restrita a
 * `service_role` (nasce de lógica de servidor: job de cobrança,
 * processamento de resposta, envio de e-mail), nunca de uma ação do client.
 */
export async function criarNotificacao(supabase: TypedClient, input: NotificacaoInsert): Promise<NotificacaoRow> {
  const { data, error } = await supabase.schema("reconfirmacao").from("notificacoes").insert(input).select().single();
  if (error) throw error;
  return data;
}

export async function contarNaoLidas(supabase: TypedClient): Promise<number> {
  const { count, error } = await supabase
    .schema("reconfirmacao")
    .from("notificacoes")
    .select("id", { count: "exact", head: true })
    .is("lida_em", null);

  if (error) throw error;
  return count ?? 0;
}

export type NotificacaoComReserva = NotificacaoRow & { reservations: { localizador: string } | null };

export async function listarRecentes(supabase: TypedClient, limite: number): Promise<NotificacaoComReserva[]> {
  const { data, error } = await supabase
    .schema("reconfirmacao")
    .from("notificacoes")
    .select("*, reservations(localizador)")
    .order("created_at", { ascending: false })
    .limit(limite);

  if (error) throw error;
  return data ?? [];
}

export async function marcarComoLida(supabase: TypedClient, id: string): Promise<void> {
  const { error } = await supabase
    .schema("reconfirmacao")
    .from("notificacoes")
    .update({ lida_em: new Date().toISOString() })
    .eq("id", id);

  if (error) throw error;
}
