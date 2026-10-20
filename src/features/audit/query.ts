export type FiltrosAuditoria = {
  status?: string;
  hotel?: string;
  localizador?: string;
  dataInicio?: string;
  dataFim?: string;
  pagamento?: string;
  tipoPendencia?: string;
};

export function filtrosFromSearchParams(params: URLSearchParams): FiltrosAuditoria {
  return {
    status: params.get("status") ?? undefined,
    hotel: params.get("hotel") ?? undefined,
    localizador: params.get("localizador") ?? undefined,
    dataInicio: params.get("dataInicio") ?? undefined,
    dataFim: params.get("dataFim") ?? undefined,
    pagamento: params.get("pagamento") ?? undefined,
    tipoPendencia: params.get("tipoPendencia") ?? undefined,
  };
}

// audit_status é view 1:1 com reservations — filtros no banco (PRD §6, nunca
// client-side) são aplicados direto nela, incluindo data de check-in/checkout
// expostas na view (ver migration 20261020191000).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function aplicarFiltros(query: any, filtros: FiltrosAuditoria) {
  if (filtros.status) query = query.eq("status", filtros.status);
  if (filtros.hotel) query = query.ilike("hotel_nome", `%${filtros.hotel}%`);
  if (filtros.localizador) query = query.ilike("localizador", `%${filtros.localizador}%`);
  if (filtros.pagamento) query = query.ilike("pagamento_manual", `%${filtros.pagamento}%`);
  if (filtros.tipoPendencia) query = query.ilike("tipo_pendencia_manual", `%${filtros.tipoPendencia}%`);
  if (filtros.dataInicio) query = query.gte("data_checkin", filtros.dataInicio);
  if (filtros.dataFim) query = query.lte("data_checkin", filtros.dataFim);
  return query;
}
