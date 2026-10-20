import { createServiceRoleClient } from "@/lib/supabase/service-role";

export type UsuarioRow = {
  id: string;
  email: string;
  full_name: string | null;
  role: "consultant" | "admin";
  active: boolean;
  created_at: string;
};

export async function listarUsuarios() {
  const supabase = createServiceRoleClient();
  return supabase
    .from("profiles")
    .select("id, email, full_name, role, active, created_at")
    .order("created_at", { ascending: false });
}

export async function atualizarUsuario(
  id: string,
  dados: { active?: boolean; role?: "consultant" | "admin" }
) {
  const supabase = createServiceRoleClient();

  const patch: { active?: boolean; role?: "consultant" | "admin" } = {};
  if (dados.active !== undefined) patch.active = dados.active;
  if (dados.role !== undefined) patch.role = dados.role;

  return supabase.from("profiles").update(patch).eq("id", id).select("id, email, full_name, role, active, created_at").single();
}

export async function convidarUsuario(email: string) {
  const supabase = createServiceRoleClient();
  return supabase.auth.admin.inviteUserByEmail(email);
}
