import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

type TypedClient = SupabaseClient<Database>;
type EmailSendInsert = Database["reconfirmacao"]["Tables"]["email_sends"]["Insert"];
type EmailSendRow = Database["reconfirmacao"]["Tables"]["email_sends"]["Row"];

export async function registrarEnvio(
  supabase: TypedClient,
  input: EmailSendInsert
): Promise<EmailSendRow> {
  const { data, error } = await supabase
    .schema("reconfirmacao")
    .from("email_sends")
    .insert(input)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function buscarEnvioPorId(supabase: TypedClient, id: string): Promise<EmailSendRow | null> {
  const { data, error } = await supabase
    .schema("reconfirmacao")
    .from("email_sends")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return data;
}

