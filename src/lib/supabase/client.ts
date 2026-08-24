import { createBrowserClient } from "@supabase/ssr";

/** Client Supabase per il browser. Usa solo la chiave anon: ogni accesso ai dati
 *  passa comunque dalle policy RLS definite in supabase/schema.sql. */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
