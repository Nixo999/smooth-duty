import { Supervisione } from "@/components/supervisione/supervisione";
import { requireMember } from "@/lib/auth";
import {
  COLONNE_FASCIA,
  COLONNE_PROFILO_CON_REPARTI,
  COLONNE_REPARTO,
  COLONNE_TURNO,
  conReparti,
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
  const [persone, turni, reparti, fasce, assenze, frequente] = await Promise.all([
    supabase
      .from("profiles")
      .select(COLONNE_PROFILO_CON_REPARTI)
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
    // Il reparto in cui ciascuno lavora piu' spesso: e' la proposta di
    // partenza quando da qui si apre un turno, come nei Turni.
    supabase.from("reparto_piu_frequente").select("profile_id, department_id"),
  ]);

  return (
    <Supervisione
      giorno={giorno}
      giornoPrima={giornoPrima}
      persone={conReparti(persone.data ?? []) as unknown as Profile[]}
      turni={(turni.data ?? []) as Shift[]}
      reparti={(reparti.data ?? []) as Department[]}
      fasce={(fasce.data ?? []) as CoverageBand[]}
      assenze={(assenze.data ?? []) as AbsenceDay[]}
      repartoFrequente={Object.fromEntries(
        ((frequente.data ?? []) as {
          profile_id: string;
          department_id: string;
        }[]).map((r) => [r.profile_id, r.department_id]),
      )}
      mioId={user.id}
      capo={user.role === "capo"}
    />
  );
}
