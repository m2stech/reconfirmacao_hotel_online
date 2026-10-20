import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Client com SUPABASE_SERVICE_ROLE_KEY — bypassa RLS.
 * Uso exclusivo em código server-only (Route Handlers, jobs): nunca importar
 * este módulo de um Client Component.
 */
export function createServiceRoleClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}
