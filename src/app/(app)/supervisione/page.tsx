import { Supervisione } from "@/components/supervisione/supervisione";
import { requireMember } from "@/lib/auth";
import {
  COLONNE_FASCIA,
  COLONNE_PROFILO,
  COLONNE_REPARTO,
  COLONNE_TURNO,
} from "@/lib/colonne";
import { toISODate } from "@/lib/date";
import { createClient } from "@/lib/supabase/server";
import { vistaGiorno, vistaPeriodo } from "@/lib/supervisione/vista";
import type { AbsenceDay, CoverageBand, Department, Profile, Shift } from "@/lib/types";
import { addDays } from "@/lib/week";

type Livello = "giorno" | "mese" | "anno";

/** Gli estremi del periodo mostrato, compresi. */
function estremi(livello: Livello, dentro: string) {
  if (livello === "giorno") return { da: dentro, a: dentro };

  const [y, m] = dentro.split("-").map(Number);
  if (livello === "mese") {
    // Giorno zero del mese dopo: l'ultimo di questo, senza tabelle di giorni.
    const ultimo = new Date(Date.UTC(y, m, 0));
    return { da: `${y}-${String(m).padStart(2, "0")}-01`, a: toISODate(ultimo) };
  }
  return { da: `${y}-01-01`, a: `${y}-12-31` };
}

export default async function SupervisionePage({
  searchParams,
}: {
  searchParams: Promise<{ v?: string; d?: string }>;
}) {
  const user = await requireMember();
  const { v, d } = await searchParams;

  const livello: Livello =
    v === "mese" ? "mese" : v === "anno" ? "anno" : "giorno";
  const dentro = d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : toISODate(new Date());
  const { da, a } = estremi(livello, dentro);

  const supabase = await createClient();

  // Si parte dal giorno prima: un turno 18:00–02:00 copre le prime ore del
  // giorno dopo, e senza guardare indietro quelle sembrerebbero scoperte.
  const primo = addDays(da, -1);

  const [persone, turni, reparti, fasce, assenze] = await Promise.all([
    supabase
      .from("profiles")
      .select(COLONNE_PROFILO)
      .eq("company_id", user.company_id)
      .eq("active", true)
      .order("full_name"),
    supabase
      .from("shifts")
      .select(COLONNE_TURNO)
      .eq("company_id", user.company_id)
      .gte("date", primo)
      .lte("date", a)
      .order("start_time"),
    supabase
      .from("departments")
      .select(COLONNE_REPARTO)
      .eq("company_id", user.company_id)
      .order("position"),
    supabase
      .from("coverage_bands")
      .select(COLONNE_FASCIA)
      .eq("company_id", user.company_id)
      .order("position"),
    // Dalla vista, non dalla tabella: questa pagina la vedono anche i
    // dipendenti, e il motivo di un'assenza altrui non li riguarda.
    supabase
      .from("absence_days")
      .select("id, profile_id, start_date, end_date")
      .lte("start_date", a)
      .or(`end_date.is.null,end_date.gte.${primo}`),
  ]);

  const elencoPersone = (persone.data ?? []) as Profile[];
  const elencoTurni = (turni.data ?? []) as Shift[];
  const elencoReparti = (reparti.data ?? []) as Department[];
  const elencoFasce = (fasce.data ?? []) as CoverageBand[];
  const elencoAssenze = (assenze.data ?? []) as AbsenceDay[];

  // Il conto si fa qui: un anno di turni sono migliaia di righe, e mandarle
  // tutte al browser per farle sommare lì sarebbe mezzo megabyte di dati per
  // mostrare venti numeri.
  const vista =
    livello === "giorno"
      ? vistaGiorno({
          giorno: da,
          turni: elencoTurni,
          persone: elencoPersone,
          reparti: elencoReparti,
          fasce: elencoFasce,
          assenze: elencoAssenze,
        })
      : vistaPeriodo({
          tipo: livello,
          da,
          a,
          turni: elencoTurni,
          persone: elencoPersone,
          reparti: elencoReparti,
          fasce: elencoFasce,
          assenze: elencoAssenze,
        });

  return (
    <Supervisione
      livello={livello}
      dentro={dentro}
      da={da}
      a={a}
      vista={vista}
      reparti={elencoReparti}
      fasce={elencoFasce}
      capo={user.role === "capo"}
    />
  );
}
