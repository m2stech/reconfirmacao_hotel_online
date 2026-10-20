import { getCurrentUserWithProfile, type Profile } from "@/lib/supabase/profile";
import type { User } from "@supabase/supabase-js";

type RequireAdminResult =
  | { ok: true; user: User; profile: Profile }
  | { ok: false; status: 401 | 403; erro: string };

/**
 * Guard de rota de API para ações exclusivas de admin (Milestone 6).
 * Páginas Server Component usam getCurrentUserWithProfile() + redirect direto;
 * este helper é para os Route Handlers que o client dessas páginas chama.
 */
export async function requireAdmin(): Promise<RequireAdminResult> {
  const { user, profile } = await getCurrentUserWithProfile();

  if (!user) {
    return { ok: false, status: 401, erro: "Não autenticado." };
  }

  if (!profile || profile.role !== "admin" || !profile.active) {
    return { ok: false, status: 403, erro: "Acesso restrito a administradores." };
  }

  return { ok: true, user, profile };
}
