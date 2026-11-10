import { NextResponse } from "next/server";
import { requireAdmin } from "@/features/admin/require-admin";
import { createClient } from "@/lib/supabase/server";
import { listarEntityTypesDistintos } from "@/features/admin/audit-log-queries";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) {
    return NextResponse.json({ ok: false, erro: guard.erro }, { status: guard.status });
  }

  const supabase = await createClient();
  const entityTypes = await listarEntityTypesDistintos(supabase);

  // Lista de usuários para o filtro de "ator" usa service role (mesmo padrão
  // de /api/admin/usuarios): RLS de public.profiles não libera consultant
  // listar outros usuários, mas aqui o chamador já passou por requireAdmin.
  const supabaseServiceRole = createServiceRoleClient();
  const { data: usuarios } = await supabaseServiceRole
    .from("profiles")
    .select("id, full_name, email")
    .order("full_name", { ascending: true });

  return NextResponse.json({
    ok: true,
    entityTypes,
    usuarios: usuarios ?? [],
  });
}
