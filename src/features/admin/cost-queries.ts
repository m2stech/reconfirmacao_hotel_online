import type { SupabaseClient } from "@supabase/supabase-js";

export type CustoPorPeriodo = {
  periodo: string; // YYYY-MM
  chamadas: number;
  tokens_input: number;
  tokens_output: number;
  custo_usd: number;
};

/**
 * Agrega custo de IA (OpenAI) por mês a partir de reconfirmacao.hotel_replies.
 * A tabela existe desde o Milestone 2, mas só recebe linhas reais a partir do
 * Milestone 9 (interpretação de respostas via OpenAI) — até lá esta query
 * retorna lista vazia, e a tela de custos reflete isso (ver PLAN.md Milestone 6).
 */
export async function agregarCustoIAporMes(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>
): Promise<{ data: CustoPorPeriodo[]; error: string | null }> {
  const { data, error } = await supabase
    .schema("reconfirmacao")
    .from("hotel_replies")
    .select("created_at, openai_tokens_input, openai_tokens_output, openai_custo_usd")
    .eq("metodo_interpretacao", "ia")
    .order("created_at", { ascending: true });

  if (error) {
    return { data: [], error: "Falha ao carregar custo de IA." };
  }

  const porPeriodo = new Map<string, CustoPorPeriodo>();

  for (const linha of data ?? []) {
    const periodo = (linha.created_at as string).slice(0, 7); // YYYY-MM
    const atual = porPeriodo.get(periodo) ?? {
      periodo,
      chamadas: 0,
      tokens_input: 0,
      tokens_output: 0,
      custo_usd: 0,
    };

    atual.chamadas += 1;
    atual.tokens_input += linha.openai_tokens_input ?? 0;
    atual.tokens_output += linha.openai_tokens_output ?? 0;
    atual.custo_usd += Number(linha.openai_custo_usd ?? 0);

    porPeriodo.set(periodo, atual);
  }

  return { data: Array.from(porPeriodo.values()).sort((a, b) => b.periodo.localeCompare(a.periodo)), error: null };
}
