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
import type { AbsenceDay, CoverageBand, Department, Profile, Shift } from "@/lib/types";
import { addDays } from "@/lib/week";

export default async function SupervisionePage({
  searchParams,
}: {
  searchParams: Promise<{ g?: string }>;
}) {
  const user = await requireMember();
  const { g } = await searchParams;

  const giorno = g && /^\d{4}-\d{2}-\d{2}$/.test(g) ? g : toISODate(new Date());
  const giornoPrima = addDays(giorno, -1);

  const supabase = await createClient();

  // Si leggono due giorni, non uno: un turno 18:00–02:00 di ieri copre le
  // prime ore di oggi, e senza guardare indietro la notte sembrerebbe scoperta.
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
      .in("date", [giornoPrima, giorno])
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
      .lte("start_date", giorno)
      .or(`end_date.is.null,end_date.gte.${giornoPrima}`),
  ]);

  return (
    <Supervisione
      giorno={giorno}
      giornoPrima={giornoPrima}
      persone={(persone.data ?? []) as Profile[]}
      turni={(turni.data ?? []) as Shift[]}
      reparti={(reparti.data ?? []) as Department[]}
      fasce={(fasce.data ?? []) as CoverageBand[]}
      assenze={(assenze.data ?? []) as AbsenceDay[]}
      capo={user.role === "capo"}
    />
  );
}
