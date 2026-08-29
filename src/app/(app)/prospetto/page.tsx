import { redirect } from "next/navigation";
import { Prospetto } from "@/components/prospetto/prospetto";
import { ErroreDati } from "@/components/ui/errore-dati";
import { requireCapo } from "@/lib/auth";
import { COLONNE_ASSENZA, COLONNE_PROFILO, COLONNE_REPARTO } from "@/lib/colonne";
import { toISODate, weekStart } from "@/lib/date";
import {
  COLONNE_IMPOSTAZIONI,
  normalizzaImpostazioni,
} from "@/lib/impostazioni";
import {
  calcolaProspetto,
  type Livello,
  type TurnoProspetto,
} from "@/lib/prospetto";
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
  const [persone, reparti, turni, assenze, impostazioni] = await Promise.all([
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
      // `rifiutato_at` serve al conto: un turno che la persona ha rifiutato
      // resta a tabellone, ma quelle ore non le fa nessuno.
      .select("profile_id, date, start_time, end_time, rifiutato_at")
      .eq("company_id", capo.company_id)
      .gte("date", da)
      .lte("date", a),
    supabase
      .from("absences")
      .select(COLONNE_ASSENZA)
      .eq("company_id", capo.company_id)
      .lte("start_date", a)
      .or(`end_date.is.null,end_date.gte.${da}`),
    supabase
      .from("company_settings")
      .select(COLONNE_IMPOSTAZIONI)
      .eq("company_id", capo.company_id)
      .maybeSingle(),
  ]);

  // L'azienda puo' non usare il Prospetto: dal menu sparisce, e dal suo
  // indirizzo si torna ai Turni.
  if (!normalizzaImpostazioni(impostazioni.data as never).pagina_prospetto) {
    redirect("/turni");
  }

  // Un errore di lettura qui darebbe un prospetto di zero ore per tutti,
  // che e' un dato falso e credibile: peggio di nessun dato.
  if (turni.error) {
    return <ErroreDati cosa="i turni" dettaglio={turni.error.message} />;
  }
  if (persone.error) {
    return <ErroreDati cosa="le persone" dettaglio={persone.error.message} />;
  }

  const dati = calcolaProspetto({
    da,
    a,
    persone: (persone.data ?? []) as Profile[],
    reparti: (reparti.data ?? []) as Department[],
    turni: (turni.data ?? []) as TurnoProspetto[],
    assenze: (assenze.data ?? []) as Absence[],
  });

  return (
    <Prospetto livello={livello} dentro={dentro} da={da} a={a} dati={dati} />
  );
}
