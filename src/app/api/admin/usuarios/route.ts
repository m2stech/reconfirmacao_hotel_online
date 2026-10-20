import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/features/admin/require-admin";
import { convidarUsuario, listarUsuarios } from "@/features/admin/queries";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) {
    return NextResponse.json({ ok: false, erro: guard.erro }, { status: guard.status });
  }

  const { data, error } = await listarUsuarios();
  if (error) {
    return NextResponse.json({ ok: false, erro: "Falha ao carregar usuários." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, usuarios: data ?? [] });
}

export async function POST(request: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) {
    return NextResponse.json({ ok: false, erro: guard.erro }, { status: guard.status });
  }

  const corpo = await request.json();
  const email: string | undefined = corpo.email?.trim();
  const fullName: string | undefined = corpo.fullName?.trim();
  const role: "consultant" | "admin" = corpo.role === "admin" ? "admin" : "consultant";

  if (!email) {
    return NextResponse.json({ ok: false, erro: "E-mail é obrigatório." }, { status: 400 });
  }
  if (!fullName) {
    return NextResponse.json({ ok: false, erro: "Nome é obrigatório." }, { status: 400 });
  }

  const { data, error } = await convidarUsuario(email, { fullName, role });
  if (error) {
    return NextResponse.json({ ok: false, erro: error.message || "Falha ao convidar usuário." }, { status: 500 });
  }

  const supabaseServiceRole = createServiceRoleClient();
  const { error: erroAuditLog } = await supabaseServiceRole.from("audit_log").insert({
    actor_id: guard.user.id,
    action: "user_invited",
    entity_type: "profile",
    entity_id: data?.user?.id,
    metadata: { email, fullName, role },
  });
  if (erroAuditLog) {
    console.error("Falha ao gravar audit_log (user_invited):", erroAuditLog);
  }

  return NextResponse.json({ ok: true });
}
