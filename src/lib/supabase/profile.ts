import { createClient } from "@/lib/supabase/server";

export type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  role: "consultant" | "admin";
  active: boolean;
};

export async function getCurrentUserWithProfile() {
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
