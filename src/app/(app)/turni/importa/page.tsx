import { Importa } from "@/components/turni/importa";
import { ErroreDati } from "@/components/ui/errore-dati";
import { requireCapo } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function ImportaPage() {
  const capo = await requireCapo();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name")
    .eq("company_id", capo.company_id)
    .eq("active", true)
    .order("full_name");

  // L'elenco serve ad abbinare i nomi del foglio alle persone vere: se la
  // lettura fallisce non ne abbina nessuno, e l'importazione entra con tutti
  // i turni senza proprietario.
  if (error) {
    return <ErroreDati cosa="le persone" dettaglio={error.message} />;
  }

  return <Importa people={data ?? []} />;
}
