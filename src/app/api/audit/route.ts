import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { aplicarFiltros, filtrosFromSearchParams } from "@/features/audit/query";

const TAMANHO_PAGINA = 20;

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, erro: "Não autenticado." }, { status: 401 });
  }

  const params = request.nextUrl.searchParams;
  const filtros = filtrosFromSearchParams(params);
  const pagina = Math.max(1, Number(params.get("pagina") ?? "1"));
  const inicio = (pagina - 1) * TAMANHO_PAGINA;
  const fim = inicio + TAMANHO_PAGINA - 1;

  let query = supabase
    .schema("reconfirmacao")
    .from("audit_status")
    .select("*", { count: "exact" })
    .order("last_email_send_at", { ascending: false, nullsFirst: false })
    .range(inicio, fim);
  query = aplicarFiltros(query, filtros);

  const { data, error, count } = await query;
  if (error) {
    return NextResponse.json({ ok: false, erro: "Falha ao consultar reservas." }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    reservas: data ?? [],
    total: count ?? 0,
    pagina,
    totalPaginas: Math.max(1, Math.ceil((count ?? 0) / TAMANHO_PAGINA)),
  });
}
