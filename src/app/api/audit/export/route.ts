import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabase/server";
import { aplicarFiltros, filtrosFromSearchParams } from "@/features/audit/query";
import { STATUS_LABEL, type StatusAuditoria } from "@/features/audit/status";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, erro: "Não autenticado." }, { status: 401 });
  }

  const filtros = filtrosFromSearchParams(request.nextUrl.searchParams);

  let query = supabase
    .schema("reconfirmacao")
    .from("audit_status")
    .select("*")
    .order("last_email_send_at", { ascending: false, nullsFirst: false });
  query = aplicarFiltros(query, filtros);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ ok: false, erro: "Falha ao exportar reservas." }, { status: 500 });
  }

  const linhas = (data ?? []).map((linha) => ({
    Localizador: linha.localizador,
    Hotel: linha.hotel_nome ?? "",
    "Check-in": linha.data_checkin ?? "",
    "Check-out": linha.data_checkout ?? "",
    Status: STATUS_LABEL[linha.status as StatusAuditoria] ?? linha.status ?? "",
    "Regime alimentar confirmado": linha.regime_alimentar_confirmado === null ? "" : linha.regime_alimentar_confirmado ? "Sim" : "Não",
    Pagamento: linha.pagamento_manual ?? "",
    "Tipo de pendência": linha.tipo_pendencia_manual ?? "",
    "Último envio em": linha.last_email_send_at ?? "",
    "Última resposta em": linha.last_hotel_reply_at ?? "",
  }));

  const planilha = XLSX.utils.json_to_sheet(linhas);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, planilha, "Auditoria");
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="auditoria-reservas-${new Date().toISOString().slice(0, 10)}.xlsx"`,
    },
  });
}
