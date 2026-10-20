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

/**
 * O trigger `handle_new_user` (schema `public`, pertence ao TripQuote) cria a
 * linha em `profiles` só com `id`/`email` ao inserir em `auth.users` — por
 * isso completamos `full_name`/`role` aqui com um update logo após o convite,
 * mesmo padrão já usado no `inviteUserAction` do TripQuote.
 */
export async function convidarUsuario(
  email: string,
  dados: { fullName: string; role: "consultant" | "admin" }
) {
  const supabase = createServiceRoleClient();

  const { data, error } = await supabase.auth.admin.inviteUserByEmail(email);
  if (error || !data.user) {
    return { data: null, error };
  }

  const { error: erroProfile } = await supabase
    .from("profiles")
    .update({ full_name: dados.fullName, role: dados.role })
    .eq("id", data.user.id);

  return { data, error: erroProfile };
}
