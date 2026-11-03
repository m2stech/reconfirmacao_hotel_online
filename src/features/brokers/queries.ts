import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

type TypedClient = SupabaseClient<Database>;

export type BrokerRow = Database["reconfirmacao"]["Tables"]["brokers"]["Row"];

export async function listarBrokers(supabase: TypedClient, filtroNome?: string) {
  let query = supabase.schema("reconfirmacao").from("brokers").select("*").order("nome", { ascending: true });

  if (filtroNome) {
    query = query.ilike("nome", `%${filtroNome}%`);
  }

  return query.returns<BrokerRow[]>();
}

export async function buscarBrokerPorNome(supabase: TypedClient, nome: string) {
  const { data, error } = await supabase
    .schema("reconfirmacao")
    .from("brokers")
    .select("*")
    .eq("nome", nome)
    .maybeSingle();

  if (error) throw error;
  return data;
}

/**
 * Cria ou atualiza o cadastro do broker (1 linha por nome de fornecedor,
 * reaproveitada entre reservas — mesmo padrão de `hotels`). Se o broker já
 * existe e o consultor informou e-mail/país diferentes, o cadastro é
 * atualizado para os próximos envios (decisão do usuário: "Atualiza o
 * cadastro", não mantém o valor antigo).
 */
export async function upsertBroker(
  supabase: TypedClient,
  input: { nome: string; email: string; pais: string },
  userId: string
): Promise<BrokerRow> {
  const existente = await buscarBrokerPorNome(supabase, input.nome);

  if (existente) {
    const { data, error } = await supabase
      .schema("reconfirmacao")
      .from("brokers")
      .update({
        email: input.email,
        pais: input.pais,
        ultima_confirmacao_em: new Date().toISOString(),
        ultima_confirmacao_por: userId,
      })
      .eq("id", existente.id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  const { data, error } = await supabase
    .schema("reconfirmacao")
    .from("brokers")
    .insert({
      nome: input.nome,
      email: input.email,
      pais: input.pais,
      ultima_confirmacao_em: new Date().toISOString(),
      ultima_confirmacao_por: userId,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function atualizarBroker(
  supabase: TypedClient,
  brokerId: string,
  input: { nome?: string; email?: string | null; pais?: string | null },
  userId: string
) {
  const { data, error } = await supabase
    .schema("reconfirmacao")
    .from("brokers")
    .update({
      ...input,
      ultima_confirmacao_em: new Date().toISOString(),
      ultima_confirmacao_por: userId,
    })
    .eq("id", brokerId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function registrarEnvioBroker(
  supabase: TypedClient,
  input: Database["reconfirmacao"]["Tables"]["broker_sends"]["Insert"]
) {
  const { data, error } = await supabase
    .schema("reconfirmacao")
    .from("broker_sends")
    .insert(input)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function listarEnviosBrokerDaReserva(supabase: TypedClient, reservationId: string) {
  return supabase
    .schema("reconfirmacao")
    .from("broker_sends")
    .select("*, brokers(nome)")
    .eq("reservation_id", reservationId)
    .order("created_at", { ascending: true });
}
