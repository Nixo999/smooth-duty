import { Squadra } from "@/components/squadra/squadra";
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

  return (
    <Squadra
      people={conReparti(persone.data ?? []) as unknown as Profile[]}
      reparti={(reparti.data ?? []) as Department[]}
      assenze={(assenze.data ?? []) as Absence[]}
      currentUserId={capo.id}
    />
  );
}
