import { Prospetto } from "@/components/prospetto/prospetto";
import { requireCapo } from "@/lib/auth";
import {
  COLONNE_ASSENZA,
  COLONNE_FASCIA,
  COLONNE_PROFILO,
  COLONNE_REPARTO,
  COLONNE_TURNO,
} from "@/lib/colonne";
import { toISODate, weekStart } from "@/lib/date";
import { calcolaProspetto, type Livello } from "@/lib/prospetto";
import { createClient } from "@/lib/supabase/server";
import type { Absence, CoverageBand, Department, Profile, Shift } from "@/lib/types";
import { addDays } from "@/lib/week";

/** Gli estremi del periodo, compresi. La settimana parte di lunedì; il mese e
 *  l'anno sono quelli di calendario. */
function estremi(livello: Livello, dentro: string) {
  const [y, m] = dentro.split("-").map(Number);

  if (livello === "settimana") {
    const lunedi = toISODate(weekStart(new Date(`${dentro}T12:00:00`)));
    return { da: lunedi, a: addDays(lunedi, 6) };
  }
  if (livello === "mese") {
    // Giorno zero del mese dopo: l'ultimo di questo, senza tabelle di giorni.
    const ultimo = new Date(Date.UTC(y, m, 0));
    return { da: `${y}-${String(m).padStart(2, "0")}-01`, a: toISODate(ultimo) };
  }
  return { da: `${y}-01-01`, a: `${y}-12-31` };
}

export default async function ProspettoPage({
  searchParams,
}: {
  searchParams: Promise<{ v?: string; d?: string }>;
}) {
  const capo = await requireCapo();
  const { v, d } = await searchParams;

  const livello: Livello =
    v === "mese" ? "mese" : v === "anno" ? "anno" : "settimana";
  const dentro = d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : toISODate(new Date());
  const { da, a } = estremi(livello, dentro);

  // Si parte dal giorno prima: un turno 18:00–02:00 copre le prime ore del
  // giorno dopo, e senza guardare indietro quelle sembrerebbero scoperte.
  const primo = addDays(da, -1);

  const supabase = await createClient();

  // Le assenze dalla tabella e non dalla vista: questa pagina la vede solo il
  // responsabile, ed è insieme a Squadra l'unico posto dove la causale serve.
  const [persone, reparti, turni, fasce, assenze] = await Promise.all([
    supabase
      .from("profiles")
      .select(COLONNE_PROFILO)
      .eq("company_id", capo.company_id)
      .eq("active", true)
      .order("full_name"),
    supabase
      .from("departments")
      .select(COLONNE_REPARTO)
      .eq("company_id", capo.company_id)
      .order("position"),
    supabase
      .from("shifts")
      .select(COLONNE_TURNO)
      .eq("company_id", capo.company_id)
      .gte("date", primo)
      .lte("date", a),
    supabase
      .from("coverage_bands")
      .select(COLONNE_FASCIA)
      .eq("company_id", capo.company_id)
      .order("position"),
    supabase
      .from("absences")
      .select(COLONNE_ASSENZA)
      .eq("company_id", capo.company_id)
      .lte("start_date", a)
      .or(`end_date.is.null,end_date.gte.${primo}`),
  ]);

  const dati = calcolaProspetto({
    livello,
    da,
    a,
    persone: (persone.data ?? []) as Profile[],
    reparti: (reparti.data ?? []) as Department[],
    turni: (turni.data ?? []) as Shift[],
    fasce: (fasce.data ?? []) as CoverageBand[],
    assenze: (assenze.data ?? []) as Absence[],
  });

  return <Prospetto dentro={dentro} da={da} a={a} dati={dati} />;
}
