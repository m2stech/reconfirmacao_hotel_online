import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/features/admin/require-admin";
import { createClient } from "@/lib/supabase/server";
import { aplicarFiltrosAuditLog, filtrosFromSearchParams } from "@/features/admin/audit-log-queries";

const TAMANHO_PAGINA = 20;

export async function GET(request: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) {
    return NextResponse.json({ ok: false, erro: guard.erro }, { status: guard.status });
  }

  const supabase = await createClient();
  const params = request.nextUrl.searchParams;
  const filtros = filtrosFromSearchParams(params);
  const pagina = Math.max(1, Number(params.get("pagina") ?? "1"));
  const inicio = (pagina - 1) * TAMANHO_PAGINA;
  const fim = inicio + TAMANHO_PAGINA - 1;

  let query = supabase
    .schema("reconfirmacao")
    .from("audit_log_detalhado")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(inicio, fim);
  query = aplicarFiltrosAuditLog(query, filtros);

  const { data, error, count } = await query;
  if (error) {
    return NextResponse.json({ ok: false, erro: "Falha ao consultar auditoria." }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    registros: data ?? [],
    total: count ?? 0,
    pagina,
    totalPaginas: Math.max(1, Math.ceil((count ?? 0) / TAMANHO_PAGINA)),
  });
}
