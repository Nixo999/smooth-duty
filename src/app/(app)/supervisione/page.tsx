import { redirect } from "next/navigation";
import { Supervisione } from "@/components/supervisione/supervisione";
import { ErroreDati } from "@/components/ui/errore-dati";
import { requireMember } from "@/lib/auth";
import {
  COLONNE_IMPOSTAZIONI,
  normalizzaImpostazioni,
} from "@/lib/impostazioni";
import { mondayOf } from "@/lib/week";
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
  const [persone, turni, reparti, fasce, assenze, frequente, impostazioni, bozze] =
    await Promise.all([
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
    supabase
      .from("company_settings")
      .select(COLONNE_IMPOSTAZIONI)
      .eq("company_id", user.company_id)
      .maybeSingle(),
    // Le settimane pubblicate fra le due dei giorni letti: al dipendente
    // i turni delle settimane ancora in bozza non si mostrano nemmeno qui.
    supabase
      .from("published_weeks")
      .select("monday")
      .eq("company_id", user.company_id)
      .in("monday", [...new Set([mondayOf(giorno), mondayOf(giornoPrima)])]),
  ]);

  // Come nei Turni: se la lettura non riesce lo si dice, invece di
  // disegnare una giornata deserta che sembra un tabellone cancellato.
  if (turni.error) {
    return <ErroreDati cosa="i turni" dettaglio={turni.error.message} />;
  }
  if (persone.error) {
    return <ErroreDati cosa="le persone" dettaglio={persone.error.message} />;
  }

  const capo = user.role === "capo";

  // Due impostazioni, non una: l'azienda puo' non usare la Supervisione
  // affatto, e chi la usa puo' tenerla al solo responsabile. Il menu la
  // nasconde gia'; queste righe valgono per chi arriva dall'indirizzo
  // diretto, o l'aveva aperta prima che la spegnessero.
  const imp = normalizzaImpostazioni(impostazioni.data as never);
  if (!imp.pagina_supervisione || (!capo && !imp.supervisione_dipendenti)) {
    redirect("/turni");
  }

  const settimanePubblicate = new Set(
    ((bozze.data ?? []) as { monday: string }[]).map((b) => b.monday),
  );
  const turniVisibili = capo
    ? ((turni.data ?? []) as Shift[])
    : ((turni.data ?? []) as Shift[]).filter((t) =>
        settimanePubblicate.has(mondayOf(t.date)),
      );

  return (
    <Supervisione
      giorno={giorno}
      giornoPrima={giornoPrima}
      persone={conReparti(persone.data ?? []) as unknown as Profile[]}
      turni={turniVisibili}
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
      capo={capo}
    />
  );
}
