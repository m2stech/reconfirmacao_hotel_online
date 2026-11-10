import type { SupabaseClient } from "@supabase/supabase-js";

export type AuditLogFiltros = {
  entityType?: string;
  actorId?: string;
  dataInicio?: string;
  dataFim?: string;
};

export function filtrosFromSearchParams(params: URLSearchParams): AuditLogFiltros {
  return {
    entityType: params.get("entityType") ?? undefined,
    actorId: params.get("actorId") ?? undefined,
    dataInicio: params.get("dataInicio") ?? undefined,
    dataFim: params.get("dataFim") ?? undefined,
  };
}

export function aplicarFiltrosAuditLog(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query: any,
  filtros: AuditLogFiltros
) {
  if (filtros.entityType) {
    query = query.eq("entity_type", filtros.entityType);
  }
  if (filtros.actorId) {
    query = query.eq("actor_id", filtros.actorId);
  }
  if (filtros.dataInicio) {
    query = query.gte("created_at", filtros.dataInicio);
  }
  if (filtros.dataFim) {
    // dataFim é uma data (YYYY-MM-DD); inclui o dia inteiro.
    query = query.lt("created_at", `${filtros.dataFim}T23:59:59.999Z`);
  }
  return query;
}

/**
 * Lista distinta de entity_type já gravados, para popular o filtro da tela
 * sem precisar de um enum fixo no código (novos entity_type podem aparecer
 * conforme o domínio cresce).
 */
export async function listarEntityTypesDistintos(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>
): Promise<string[]> {
  const { data } = await supabase
    .schema("reconfirmacao")
    .from("audit_log")
    .select("entity_type")
    .order("entity_type", { ascending: true });

  return Array.from(new Set((data ?? []).map((linha: { entity_type: string }) => linha.entity_type)));
}
