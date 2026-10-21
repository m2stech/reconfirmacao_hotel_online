import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

type TypedClient = SupabaseClient<Database>;
type HotelReplyInsert = Database["reconfirmacao"]["Tables"]["hotel_replies"]["Insert"];
type HotelReplyRow = Database["reconfirmacao"]["Tables"]["hotel_replies"]["Row"];

/**
 * Registra uma resposta interpretada. `unique(internet_message_id)` garante
 * idempotência real — nunca duas linhas para a mesma mensagem do Graph
 * (PRD §5.3). Quem chama deve checar `jaRegistrada` antes, para não tratar
 * a constraint violation como erro de negócio.
 */
export async function registrarResposta(supabase: TypedClient, input: HotelReplyInsert): Promise<HotelReplyRow> {
  const { data, error } = await supabase.schema("reconfirmacao").from("hotel_replies").insert(input).select().single();

  if (error) throw error;
  return data;
}

export async function jaRegistrada(supabase: TypedClient, internetMessageId: string): Promise<boolean> {
  const { data, error } = await supabase
    .schema("reconfirmacao")
    .from("hotel_replies")
    .select("id")
    .eq("internet_message_id", internetMessageId)
    .maybeSingle();

  if (error) throw error;
  return data !== null;
}

/** Histórico de respostas de uma reserva, ordenado por `recebido_em` ascendente — usado no acúmulo de estado ao longo de tréplicas. */
export async function listarRespostasDaReserva(supabase: TypedClient, emailSendIds: string[]): Promise<HotelReplyRow[]> {
  if (emailSendIds.length === 0) return [];

  const { data, error } = await supabase
    .schema("reconfirmacao")
    .from("hotel_replies")
    .select("*")
    .in("email_send_id", emailSendIds)
    .order("recebido_em", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

/**
 * Todos os `internet_message_id` já registrados em `hotel_replies` — usado
 * para não reprocessar, numa conversa longa, uma mensagem já registrada
 * para outro envio da mesma reserva (portado de `ler_historico_respostas`
 * em respostas.py).
 */
export async function listarInternetMessageIdsConhecidos(supabase: TypedClient): Promise<Set<string>> {
  const { data, error } = await supabase.schema("reconfirmacao").from("hotel_replies").select("internet_message_id");

  if (error) throw error;
  return new Set((data ?? []).map((linha) => linha.internet_message_id));
}
