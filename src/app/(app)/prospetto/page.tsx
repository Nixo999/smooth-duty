import { Prospetto } from "@/components/prospetto/prospetto";
import { requireCapo } from "@/lib/auth";
import { COLONNE_ASSENZA, COLONNE_PROFILO, COLONNE_REPARTO } from "@/lib/colonne";
import { toISODate, weekStart } from "@/lib/date";
import { calcolaProspetto, type Livello } from "@/lib/prospetto";
import { createClient } from "@/lib/supabase/server";
import type { Absence, Department, Profile } from "@/lib/types";
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
  searchParams: Promise<{ p?: string; d?: string }>;
}) {
  const capo = await requireCapo();
  const { p, d } = await searchParams;

  const livello: Livello =
    p === "mese" ? "mese" : p === "anno" ? "anno" : "settimana";
  const dentro = d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : toISODate(new Date());
  const { da, a } = estremi(livello, dentro);

  const supabase = await createClient();

  // Dalla tabella e non dalla vista: questa pagina la vede solo il
  // responsabile, ed è insieme a Squadra l'unico posto dove la causale serve.
  const [persone, reparti, turni, assenze] = await Promise.all([
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
      .select("profile_id, date, start_time, end_time")
      .eq("company_id", capo.company_id)
      .gte("date", da)
      .lte("date", a),
    supabase
      .from("absences")
      .select(COLONNE_ASSENZA)
      .eq("company_id", capo.company_id)
      .lte("start_date", a)
      .or(`end_date.is.null,end_date.gte.${da}`),
  ]);

  const dati = calcolaProspetto({
    da,
    a,
    persone: (persone.data ?? []) as Profile[],
    reparti: (reparti.data ?? []) as Department[],
    turni: (turni.data ?? []) as {
      profile_id: string | null;
      date: string;
      start_time: string;
      end_time: string;
    }[],
    assenze: (assenze.data ?? []) as Absence[],
  });

  return (
    <Prospetto livello={livello} dentro={dentro} da={da} a={a} dati={dati} />
  );
}
