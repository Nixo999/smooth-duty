import { Squadra } from "@/components/squadra/squadra";
import { ErroreDati } from "@/components/ui/errore-dati";
import { requireCapo } from "@/lib/auth";
import {
  COLONNE_ASSENZA,
  COLONNE_PROFILO_CON_REPARTI,
  COLONNE_REPARTO,
  conReparti,
} from "@/lib/colonne";
import { createClient } from "@/lib/supabase/server";
import type { Absence, Department, Profile } from "@/lib/types";

export default async function SquadraPage() {
  const capo = await requireCapo();

  // Filtro esplicito, non affidato a RLS: chi amministra la piattaforma può
  // leggere i profili di ogni azienda, e questa pagina deve mostrare solo
  // quelli della propria.
  const supabase = await createClient();
  const [persone, reparti, assenze] = await Promise.all([
    supabase
      .from("profiles")
      .select(COLONNE_PROFILO_CON_REPARTI)
      .eq("company_id", capo.company_id)
      .order("active", { ascending: false })
      .order("full_name"),
    supabase
      .from("departments")
      .select(COLONNE_REPARTO)
      .eq("company_id", capo.company_id)
      .order("position"),
    // Solo quelle in corso: qui interessa chi è assente adesso.
    supabase
      .from("absences")
      .select(COLONNE_ASSENZA)
      .eq("company_id", capo.company_id)
      .is("end_date", null),
  ]);

  // Le tre letture si controllano tutte, e non e' zelo: una squadra vuota per
  // errore e' indistinguibile da un'azienda appena creata, i reparti mancanti
  // fanno sembrare tutti senza reparto, e le assenze mancanti mettono al
  // lavoro chi e' a casa in malattia. Il vuoto vero si vede lo stesso: e'
  // `data` vuoto **senza** errore.
  if (persone.error) {
    return <ErroreDati cosa="le persone" dettaglio={persone.error.message} />;
  }
  if (reparti.error) {
    return <ErroreDati cosa="i reparti" dettaglio={reparti.error.message} />;
  }
  if (assenze.error) {
    return <ErroreDati cosa="le assenze" dettaglio={assenze.error.message} />;
  }

  return (
    <Squadra
      people={conReparti(persone.data ?? []) as unknown as Profile[]}
      reparti={(reparti.data ?? []) as Department[]}
      assenze={(assenze.data ?? []) as Absence[]}
      currentUserId={capo.id}
    />
  );
}
