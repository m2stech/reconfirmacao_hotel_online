import { NextResponse } from "next/server";
import { requireAdmin } from "@/features/admin/require-admin";
import { createClient } from "@/lib/supabase/server";
import { agregarCustoIAporMes } from "@/features/admin/cost-queries";

export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) {
    return NextResponse.json({ ok: false, erro: guard.erro }, { status: guard.status });
  }

  const supabase = await createClient();
  const { data, error } = await agregarCustoIAporMes(supabase);
  if (error) {
    return NextResponse.json({ ok: false, erro: error }, { status: 500 });
  }

  return NextResponse.json({ ok: true, custos: data });
}
