import "server-only";
import { createClient } from "@supabase/supabase-js";

/** Client con service_role: scavalca RLS.
 *  Serve solo per creare account (registrazione azienda, aggiunta dipendente),
 *  cose che l'utente non puo' fare da solo. Non deve mai finire nel bundle del
 *  browser: l'import di "server-only" fa fallire la build se succede. */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY mancante: aggiungila in .env.local",
    );
  }

  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
