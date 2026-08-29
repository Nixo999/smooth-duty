import { Impostazioni } from "@/components/impostazioni/impostazioni";
import { ErroreDati } from "@/components/ui/errore-dati";
import { requireCapo } from "@/lib/auth";
import {
  COLONNE_IMPOSTAZIONI,
  normalizzaImpostazioni,
} from "@/lib/impostazioni";
import { createClient } from "@/lib/supabase/server";

export default async function ImpostazioniPage() {
  const capo = await requireCapo();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("company_settings")
    .select(COLONNE_IMPOSTAZIONI)
    .eq("company_id", capo.company_id)
    .maybeSingle();

  // Senza questo controllo la pagina era una bugia con le levette: la
  // lettura falliva, `normalizzaImpostazioni` restituiva i default, e chi
  // guardava leggeva le impostazioni di un'azienda che non era la sua. Poi
  // premeva Salva e l'errore usciva li', dopo aver gia' creduto a quello che
  // vedeva. Il vuoto — riga assente — resta un caso normale e legittimo:
  // quello e' `data === null` senza errore, e vale i default.
  if (error) {
    return <ErroreDati cosa="le impostazioni" dettaglio={error.message} />;
  }

  return (
    <Impostazioni
      valori={normalizzaImpostazioni(data as never)}
      azienda={capo.company.name}
    />
  );
}
