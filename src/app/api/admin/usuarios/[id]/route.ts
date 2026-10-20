import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/features/admin/require-admin";
import { atualizarUsuario } from "@/features/admin/queries";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireAdmin();
  if (!guard.ok) {
    return NextResponse.json({ ok: false, erro: guard.erro }, { status: guard.status });
  }

  if (id === guard.user.id) {
    return NextResponse.json(
      { ok: false, erro: "Não é possível alterar o próprio usuário por aqui." },
      { status: 400 }
    );
  }

  const corpo = await request.json();
  const active: boolean | undefined = typeof corpo.active === "boolean" ? corpo.active : undefined;
  const role: "consultant" | "admin" | undefined =
    corpo.role === "consultant" || corpo.role === "admin" ? corpo.role : undefined;

  if (active === undefined && role === undefined) {
    return NextResponse.json({ ok: false, erro: "Nada para atualizar." }, { status: 400 });
  }

  const { data, error } = await atualizarUsuario(id, { active, role });
  if (error || !data) {
    return NextResponse.json({ ok: false, erro: "Falha ao atualizar usuário." }, { status: 500 });
  }

  const supabaseServiceRole = createServiceRoleClient();
  const { error: erroAuditLog } = await supabaseServiceRole.from("audit_log").insert({
    actor_id: guard.user.id,
    action: active !== undefined ? (active ? "user_reactivated" : "user_deactivated") : "user_role_changed",
    entity_type: "profile",
    entity_id: id,
    metadata: { active, role },
  });
  if (erroAuditLog) {
    console.error("Falha ao gravar audit_log (atualização de usuário):", erroAuditLog);
  }

  return NextResponse.json({ ok: true, usuario: data });
}
