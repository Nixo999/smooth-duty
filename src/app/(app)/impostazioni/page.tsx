import { Impostazioni } from "@/components/impostazioni/impostazioni";
import { requireCapo } from "@/lib/auth";
import {
  COLONNE_IMPOSTAZIONI,
  normalizzaImpostazioni,
} from "@/lib/impostazioni";
import { createClient } from "@/lib/supabase/server";

export default async function ImpostazioniPage() {
  const capo = await requireCapo();

  const supabase = await createClient();
  const { data } = await supabase
    .from("company_settings")
    .select(COLONNE_IMPOSTAZIONI)
    .eq("company_id", capo.company_id)
    .maybeSingle();

  return (
    <Impostazioni
      valori={normalizzaImpostazioni(data as never)}
      azienda={capo.company.name}
    />
  );
}
