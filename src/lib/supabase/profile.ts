import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";

export type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  role: "consultant" | "admin";
  active: boolean;
};

export async function getCurrentUserWithProfile() {
  // Força o boundary dinâmico do Next 16 Cache Components antes de ler
  // sessão/cookies — sem isso, o prerendering estático tenta renderizar
  // esta função e expõe o uso interno de Date.now() do SDK Supabase
  // (checagem de expiração de token) como "unstable value" (bug real
  // encontrado em produção no Milestone 13: /admin/custos e outras rotas
  // que chamam esta função ficavam com página em branco/erro).
  await connection();
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { user: null, profile: null };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, email, full_name, role, active")
    .eq("id", user.id)
    .single();

  return { user, profile: profile as Profile | null };
}
